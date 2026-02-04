import type {
  MetricsGuardrailsStableBuffer,
  StableBufferMetrics,
  StableBufferState,
  StableBufferOptions,
  StableBufferTransactionOptions,
  StableBufferTransactionLogger
} from '../types/index.js';
import { MetricsValidator } from '../utilities/index.js';

export class StableBuffer {
  private state: StableBufferState;
  private queue: Promise<unknown> = Promise.resolve();
  private totalTransactions = 0;
  private totalWaitMs = 0;
  private transactionSequence = 0;
  private cloneState: (state: StableBufferState) => StableBufferState;
  private metricsGuardrails?: MetricsGuardrailsStableBuffer;
  private transactionTimeoutMs?: number;
  private logTransaction?: StableBufferTransactionLogger;

  constructor(options: StableBufferOptions = {}) {
    this.state = options.initialState ? { ...options.initialState } : {};
    this.cloneState = options.clone ?? ((value) => {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
      return JSON.parse(JSON.stringify(value));
    });
    this.metricsGuardrails = options.metricsGuardrails;
    this.transactionTimeoutMs = options.transactionTimeoutMs ?? 0;
    this.logTransaction = options.logTransaction;
  }

  read(): StableBufferState {
    return this.cloneState(this.state);
  }

  getState(): StableBufferState {
    return this.state;
  }

  setState(nextState: StableBufferState): void {
    this.state = nextState;
  }

  async run<T>(fn: (state: StableBufferState) => T | Promise<T>, options: StableBufferTransactionOptions = {}): Promise<T> {
    const queuedAt = Date.now();
    const transactionId = this.createTransactionId();
    const task = async () => {
      const startAt = Date.now();
      const queueWaitMs = Math.max(0, startAt - queuedAt);
      this.totalWaitMs += queueWaitMs;
      this.totalTransactions += 1;
      const stateBefore = this.cloneState(this.state);
      let success = false;
      let errorMessage: string | undefined;
      try {
        const result = await fn(this.state);
        success = true;
        return result;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        const finishedAt = Date.now();
        const stateAfter = this.cloneState(this.state);
        if (this.logTransaction) {
          const logEntry = {
            ...options,
            transactionId,
            queuedAt: new Date(queuedAt).toISOString(),
            startedAt: new Date(startAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            durationMs: Math.max(0, finishedAt - startAt),
            queueWaitMs,
            success,
            errorMessage,
            stateBefore,
            stateAfter
          };
          try {
            await this.logTransaction(logEntry);
          } catch {
            // Swallow logging errors to avoid breaking transactions
          }
        }
      }
    };

    const executionPromise = this.queue.then(task, task);
    this.queue = executionPromise.then(
      () => undefined,
      () => undefined
    );

    return this.wrapWithTimeout(executionPromise, this.transactionTimeoutMs);
  }

  private async wrapWithTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) {
      return promise;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`StableBuffer transaction timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
  }

  async update(mutator: (state: StableBufferState) => void | Promise<void>, options?: StableBufferTransactionOptions): Promise<void> {
    await this.run(async (state) => {
      await mutator(state);
    }, options);
  }

  async transaction<T>(fn: (state: StableBufferState) => T | Promise<T>, options?: StableBufferTransactionOptions): Promise<T> {
    return this.run(fn, options);
  }

  private createTransactionId(): string {
    this.transactionSequence += 1;
    return `stable-buffer-${Date.now()}-${this.transactionSequence}`;
  }

  getMetrics(): StableBufferMetrics {
    const metrics: StableBufferMetrics = {
      totalTransactions: this.totalTransactions,
      averageQueueWaitMs: this.totalTransactions > 0 ? this.totalWaitMs / this.totalTransactions : 0
    };

    if (!this.metricsGuardrails) {
      return metrics;
    }

    return {
      ...metrics,
      validation: MetricsValidator.validateStableBufferMetrics(metrics, {
        stableBuffer: this.metricsGuardrails
      })
    };
  }
}
