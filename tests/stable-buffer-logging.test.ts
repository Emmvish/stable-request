/**
 * Test Suite 2: StableBuffer Transaction Logging and Replay
 * Tests transaction logging, replay functionality, and activity tracking
 */

import { StableBuffer } from '../src/core/stable-buffer.js';
import { replayStableBufferTransactions } from '../src/utilities/stable-buffer-replay.js';
import type { 
  StableBufferTransactionLog,
  StableBufferReplayHandler,
  StableBufferReplayResult
} from '../src/types/index.js';

describe('StableBuffer - Transaction Logging', () => {
  describe('logTransaction callback', () => {
    it('should call logTransaction for each transaction', async () => {
      const logs: StableBufferTransactionLog[] = [];
      
      const buffer = new StableBuffer({
        initialState: { counter: 0 },
        logTransaction: async (log) => {
          logs.push(log);
        }
      });
      
      await buffer.run((state) => {
        state.counter = 10;
      });
      
      expect(logs.length).toBe(1);
    });

    it('should include correct transaction metadata', async () => {
      let capturedLog: StableBufferTransactionLog | null = null;
      
      const buffer = new StableBuffer({
        initialState: { value: 'initial' },
        logTransaction: async (log) => {
          capturedLog = log;
        }
      });
      
      await buffer.run((state) => {
        state.value = 'updated';
      });
      
      expect(capturedLog).not.toBeNull();
      expect(capturedLog!.transactionId).toMatch(/^stable-buffer-\d+-\d+$/);
      expect(capturedLog!.success).toBe(true);
      expect(capturedLog!.errorMessage).toBeUndefined();
      expect(capturedLog!.durationMs).toBeGreaterThanOrEqual(0);
      expect(capturedLog!.queueWaitMs).toBeGreaterThanOrEqual(0);
    });

    it('should capture stateBefore and stateAfter', async () => {
      let capturedLog: StableBufferTransactionLog | null = null;
      
      const buffer = new StableBuffer({
        initialState: { counter: 5 },
        logTransaction: async (log) => {
          capturedLog = log;
        }
      });
      
      await buffer.run((state) => {
        state.counter = state.counter + 10;
      });
      
      expect(capturedLog!.stateBefore).toEqual({ counter: 5 });
      expect(capturedLog!.stateAfter).toEqual({ counter: 15 });
    });

    it('should log failed transactions with error message', async () => {
      let capturedLog: StableBufferTransactionLog | null = null;
      
      const buffer = new StableBuffer({
        initialState: {},
        logTransaction: async (log) => {
          capturedLog = log;
        }
      });
      
      try {
        await buffer.run(() => {
          throw new Error('Test error');
        });
      } catch {
        // Expected
      }
      
      expect(capturedLog!.success).toBe(false);
      expect(capturedLog!.errorMessage).toBe('Test error');
    });

    it('should include transaction options in log', async () => {
      let capturedLog: StableBufferTransactionLog | null = null;
      
      const buffer = new StableBuffer({
        initialState: {},
        logTransaction: async (log) => {
          capturedLog = log;
        }
      });
      
      await buffer.run(
        (state) => {
          state.processed = true;
        },
        {
          activity: 'processOrder',
          hookName: 'orderHandler',
          hookParams: { orderId: '12345' },
          workflowId: 'wf-001',
          requestId: 'req-001'
        }
      );
      
      expect(capturedLog!.activity).toBe('processOrder');
      expect(capturedLog!.hookName).toBe('orderHandler');
      expect(capturedLog!.hookParams).toEqual({ orderId: '12345' });
      expect(capturedLog!.workflowId).toBe('wf-001');
      expect(capturedLog!.requestId).toBe('req-001');
    });

    it('should not break transactions if logTransaction throws', async () => {
      const buffer = new StableBuffer({
        initialState: { counter: 0 },
        logTransaction: async () => {
          throw new Error('Logging failed');
        }
      });
      
      // Should still complete the transaction
      await buffer.run((state) => {
        state.counter = 100;
      });
      
      expect(buffer.read().counter).toBe(100);
    });

    it('should have valid timestamps in ISO format', async () => {
      let capturedLog: StableBufferTransactionLog | null = null;
      
      const buffer = new StableBuffer({
        initialState: {},
        logTransaction: async (log) => {
          capturedLog = log;
        }
      });
      
      await buffer.run(() => {});
      
      expect(Date.parse(capturedLog!.queuedAt)).not.toBeNaN();
      expect(Date.parse(capturedLog!.startedAt)).not.toBeNaN();
      expect(Date.parse(capturedLog!.finishedAt)).not.toBeNaN();
    });
  });
});

describe('StableBuffer - Transaction Replay', () => {
  const createMockLogs = (): StableBufferTransactionLog[] => [
    {
      transactionId: 'txn-1',
      queuedAt: '2024-01-01T10:00:00.000Z',
      startedAt: '2024-01-01T10:00:00.010Z',
      finishedAt: '2024-01-01T10:00:00.020Z',
      durationMs: 10,
      queueWaitMs: 10,
      success: true,
      stateBefore: { counter: 0 },
      stateAfter: { counter: 1 },
      hookName: 'incrementCounter',
      hookParams: { amount: 1 }
    },
    {
      transactionId: 'txn-2',
      queuedAt: '2024-01-01T10:00:01.000Z',
      startedAt: '2024-01-01T10:00:01.010Z',
      finishedAt: '2024-01-01T10:00:01.020Z',
      durationMs: 10,
      queueWaitMs: 10,
      success: true,
      stateBefore: { counter: 1 },
      stateAfter: { counter: 6 },
      hookName: 'incrementCounter',
      hookParams: { amount: 5 }
    },
    {
      transactionId: 'txn-3',
      queuedAt: '2024-01-01T10:00:02.000Z',
      startedAt: '2024-01-01T10:00:02.010Z',
      finishedAt: '2024-01-01T10:00:02.020Z',
      durationMs: 10,
      queueWaitMs: 10,
      success: true,
      stateBefore: { counter: 6 },
      stateAfter: { counter: 6, name: 'test' },
      hookName: 'setName',
      hookParams: { name: 'test' }
    }
  ];

  describe('Basic replay functionality', () => {
    it('should replay transactions with handlers', async () => {
      const logs = createMockLogs();
      
      const handlers: Record<string, StableBufferReplayHandler> = {
        incrementCounter: async (state, log) => {
          state.counter = (state.counter || 0) + log.hookParams.amount;
        },
        setName: async (state, log) => {
          state.name = log.hookParams.name;
        }
      };
      
      const result = await replayStableBufferTransactions({
        logs,
        handlers,
        initialState: { counter: 0 }
      });
      
      expect(result.applied).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors.length).toBe(0);
      
      const finalState = result.buffer.read();
      expect(finalState.counter).toBe(6);
      expect(finalState.name).toBe('test');
    });

    it('should use provided buffer instead of creating new one', async () => {
      const existingBuffer = new StableBuffer({
        initialState: { counter: 100, existing: true }
      });
      
      const logs: StableBufferTransactionLog[] = [{
        transactionId: 'txn-1',
        queuedAt: '2024-01-01T10:00:00.000Z',
        startedAt: '2024-01-01T10:00:00.010Z',
        finishedAt: '2024-01-01T10:00:00.020Z',
        durationMs: 10,
        queueWaitMs: 10,
        success: true,
        stateBefore: {},
        stateAfter: {},
        hookName: 'addValue',
        hookParams: { value: 50 }
      }];
      
      const result = await replayStableBufferTransactions({
        logs,
        handlers: {
          addValue: async (state, log) => {
            state.counter = (state.counter || 0) + log.hookParams.value;
          }
        },
        buffer: existingBuffer
      });
      
      expect(result.buffer).toBe(existingBuffer);
      expect(result.buffer.read().counter).toBe(150);
      expect(result.buffer.read().existing).toBe(true);
    });
  });

  describe('Sorting', () => {
    it('should sort logs by startedAt when sort=true', async () => {
      const executionOrder: string[] = [];
      
      const logs: StableBufferTransactionLog[] = [
        {
          transactionId: 'txn-3',
          queuedAt: '2024-01-01T10:00:02.000Z',
          startedAt: '2024-01-01T10:00:02.000Z',
          finishedAt: '2024-01-01T10:00:02.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'track',
          hookParams: { id: 'C' }
        },
        {
          transactionId: 'txn-1',
          queuedAt: '2024-01-01T10:00:00.000Z',
          startedAt: '2024-01-01T10:00:00.000Z',
          finishedAt: '2024-01-01T10:00:00.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'track',
          hookParams: { id: 'A' }
        },
        {
          transactionId: 'txn-2',
          queuedAt: '2024-01-01T10:00:01.000Z',
          startedAt: '2024-01-01T10:00:01.000Z',
          finishedAt: '2024-01-01T10:00:01.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'track',
          hookParams: { id: 'B' }
        }
      ];
      
      await replayStableBufferTransactions({
        logs,
        handlers: {
          track: async (state, log) => {
            executionOrder.push(log.hookParams.id);
          }
        },
        sort: true
      });
      
      expect(executionOrder).toEqual(['A', 'B', 'C']);
    });

    it('should preserve original order when sort=false', async () => {
      const executionOrder: string[] = [];
      
      const logs: StableBufferTransactionLog[] = [
        {
          transactionId: 'txn-3',
          queuedAt: '2024-01-01T10:00:02.000Z',
          startedAt: '2024-01-01T10:00:02.000Z',
          finishedAt: '2024-01-01T10:00:02.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'track',
          hookParams: { id: 'C' }
        },
        {
          transactionId: 'txn-1',
          queuedAt: '2024-01-01T10:00:00.000Z',
          startedAt: '2024-01-01T10:00:00.000Z',
          finishedAt: '2024-01-01T10:00:00.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'track',
          hookParams: { id: 'A' }
        }
      ];
      
      await replayStableBufferTransactions({
        logs,
        handlers: {
          track: async (state, log) => {
            executionOrder.push(log.hookParams.id);
          }
        },
        sort: false
      });
      
      expect(executionOrder).toEqual(['C', 'A']);
    });
  });

  describe('Deduplication', () => {
    it('should skip duplicate transaction IDs when dedupe=true', async () => {
      const logs: StableBufferTransactionLog[] = [
        {
          transactionId: 'txn-1',
          queuedAt: '2024-01-01T10:00:00.000Z',
          startedAt: '2024-01-01T10:00:00.000Z',
          finishedAt: '2024-01-01T10:00:00.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: { counter: 0 },
          stateAfter: { counter: 1 },
          hookName: 'increment',
          hookParams: {}
        },
        {
          transactionId: 'txn-1', // Duplicate
          queuedAt: '2024-01-01T10:00:01.000Z',
          startedAt: '2024-01-01T10:00:01.000Z',
          finishedAt: '2024-01-01T10:00:01.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: { counter: 1 },
          stateAfter: { counter: 2 },
          hookName: 'increment',
          hookParams: {}
        }
      ];
      
      const result = await replayStableBufferTransactions({
        logs,
        handlers: {
          increment: async (state) => {
            state.counter = (state.counter || 0) + 1;
          }
        },
        initialState: { counter: 0 },
        dedupe: true
      });
      
      expect(result.applied).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.buffer.read().counter).toBe(1);
    });

    it('should process all duplicates when dedupe=false', async () => {
      const logs: StableBufferTransactionLog[] = [
        {
          transactionId: 'txn-1',
          queuedAt: '2024-01-01T10:00:00.000Z',
          startedAt: '2024-01-01T10:00:00.000Z',
          finishedAt: '2024-01-01T10:00:00.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'increment',
          hookParams: {}
        },
        {
          transactionId: 'txn-1', // Duplicate
          queuedAt: '2024-01-01T10:00:01.000Z',
          startedAt: '2024-01-01T10:00:01.000Z',
          finishedAt: '2024-01-01T10:00:01.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'increment',
          hookParams: {}
        }
      ];
      
      const result = await replayStableBufferTransactions({
        logs,
        handlers: {
          increment: async (state) => {
            state.counter = (state.counter || 0) + 1;
          }
        },
        initialState: { counter: 0 },
        dedupe: false
      });
      
      expect(result.applied).toBe(2);
      expect(result.buffer.read().counter).toBe(2);
    });
  });

  describe('Missing handlers', () => {
    it('should track errors for missing handlers when allowUnknownHooks=false', async () => {
      const logs: StableBufferTransactionLog[] = [{
        transactionId: 'txn-1',
        queuedAt: '2024-01-01T10:00:00.000Z',
        startedAt: '2024-01-01T10:00:00.000Z',
        finishedAt: '2024-01-01T10:00:00.010Z',
        durationMs: 10,
        queueWaitMs: 0,
        success: true,
        stateBefore: {},
        stateAfter: {},
        hookName: 'unknownHook',
        hookParams: {}
      }];
      
      const result = await replayStableBufferTransactions({
        logs,
        handlers: {},
        allowUnknownHooks: false
      });
      
      expect(result.applied).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toBeInstanceOf(Error);
    });

    it('should skip missing handlers when allowUnknownHooks=true', async () => {
      const logs: StableBufferTransactionLog[] = [{
        transactionId: 'txn-1',
        queuedAt: '2024-01-01T10:00:00.000Z',
        startedAt: '2024-01-01T10:00:00.000Z',
        finishedAt: '2024-01-01T10:00:00.010Z',
        durationMs: 10,
        queueWaitMs: 0,
        success: true,
        stateBefore: {},
        stateAfter: {},
        hookName: 'unknownHook',
        hookParams: {}
      }];
      
      const result = await replayStableBufferTransactions({
        logs,
        handlers: {},
        allowUnknownHooks: true
      });
      
      expect(result.applied).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('Activity filtering', () => {
    it('should filter logs based on activityFilter', async () => {
      const logs: StableBufferTransactionLog[] = [
        {
          transactionId: 'txn-1',
          queuedAt: '2024-01-01T10:00:00.000Z',
          startedAt: '2024-01-01T10:00:00.000Z',
          finishedAt: '2024-01-01T10:00:00.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'process',
          hookParams: {},
          activity: 'orderProcessing'
        },
        {
          transactionId: 'txn-2',
          queuedAt: '2024-01-01T10:00:01.000Z',
          startedAt: '2024-01-01T10:00:01.000Z',
          finishedAt: '2024-01-01T10:00:01.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'process',
          hookParams: {},
          activity: 'paymentProcessing'
        }
      ];
      
      const result = await replayStableBufferTransactions({
        logs,
        handlers: {
          process: async (state) => {
            state.processed = (state.processed || 0) + 1;
          }
        },
        activityFilter: (log) => log.activity === 'orderProcessing'
      });
      
      expect(result.applied).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  describe('Callbacks', () => {
    it('should call onApply for each applied transaction', async () => {
      const appliedLogs: StableBufferTransactionLog[] = [];
      
      const logs = createMockLogs().slice(0, 2);
      
      await replayStableBufferTransactions({
        logs,
        handlers: {
          incrementCounter: async () => {}
        },
        onApply: (log) => appliedLogs.push(log)
      });
      
      expect(appliedLogs.length).toBe(2);
    });

    it('should call onSkip with reason for skipped transactions', async () => {
      const skippedInfo: Array<{ log: StableBufferTransactionLog; reason: string }> = [];
      
      const logs: StableBufferTransactionLog[] = [
        {
          transactionId: 'txn-1',
          queuedAt: '2024-01-01T10:00:00.000Z',
          startedAt: '2024-01-01T10:00:00.000Z',
          finishedAt: '2024-01-01T10:00:00.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'test',
          hookParams: {}
        },
        {
          transactionId: 'txn-1', // Duplicate
          queuedAt: '2024-01-01T10:00:01.000Z',
          startedAt: '2024-01-01T10:00:01.000Z',
          finishedAt: '2024-01-01T10:00:01.010Z',
          durationMs: 10,
          queueWaitMs: 0,
          success: true,
          stateBefore: {},
          stateAfter: {},
          hookName: 'test',
          hookParams: {}
        }
      ];
      
      await replayStableBufferTransactions({
        logs,
        handlers: {
          test: async () => {}
        },
        dedupe: true,
        onSkip: (log, reason) => skippedInfo.push({ log, reason })
      });
      
      expect(skippedInfo.length).toBe(1);
      expect(skippedInfo[0].reason).toBe('duplicate');
    });

    it('should call onError for handler errors', async () => {
      const errors: Array<{ log: StableBufferTransactionLog; error: unknown }> = [];
      
      const logs: StableBufferTransactionLog[] = [{
        transactionId: 'txn-1',
        queuedAt: '2024-01-01T10:00:00.000Z',
        startedAt: '2024-01-01T10:00:00.000Z',
        finishedAt: '2024-01-01T10:00:00.010Z',
        durationMs: 10,
        queueWaitMs: 0,
        success: true,
        stateBefore: {},
        stateAfter: {},
        hookName: 'failingHandler',
        hookParams: {}
      }];
      
      await replayStableBufferTransactions({
        logs,
        handlers: {
          failingHandler: async () => {
            throw new Error('Handler failed');
          }
        },
        onError: (log, error) => errors.push({ log, error })
      });
      
      expect(errors.length).toBe(1);
      expect(errors[0].error).toBeInstanceOf(Error);
    });
  });
});
