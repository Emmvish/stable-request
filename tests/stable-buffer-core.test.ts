/**
 * Test Suite 1: StableBuffer Core Functionality
 * Tests basic operations, transactions, state management, and metrics
 */

import { StableBuffer } from '../src/core/stable-buffer.js';
import type { 
  StableBufferOptions, 
  StableBufferTransactionLog,
  StableBufferMetrics 
} from '../src/types/index.js';

describe('StableBuffer - Core Functionality', () => {
  describe('Constructor and Initial State', () => {
    it('should create a buffer with empty initial state by default', () => {
      const buffer = new StableBuffer();
      expect(buffer.read()).toEqual({});
    });

    it('should create a buffer with provided initial state', () => {
      const initialState = { counter: 0, name: 'test' };
      const buffer = new StableBuffer({ initialState });
      expect(buffer.read()).toEqual(initialState);
    });

    it('should shallow clone initial state on creation', () => {
      const initialState = { counter: 0, name: 'test' };
      const buffer = new StableBuffer({ initialState });
      
      // Mutate original after buffer creation
      initialState.counter = 100;
      initialState.name = 'mutated';
      
      // Buffer should retain original primitive values (shallow copy protects top-level properties)
      const freshState = buffer.read();
      expect(freshState.counter).toBe(0);
      expect(freshState.name).toBe('test');
    });

    it('should return clone on read() to prevent external mutation', () => {
      const initialState = { counter: 0, items: [1, 2, 3] };
      const buffer = new StableBuffer({ initialState });
      
      // Get a clone via read()
      const readState = buffer.read();
      
      // Mutate the clone
      readState.counter = 999;
      readState.items.push(999);
      
      // Buffer internal state should remain unchanged
      const freshState = buffer.read();
      expect(freshState.counter).toBe(0);
      expect(freshState.items).toEqual([1, 2, 3]);
    });
  });

  describe('read() method', () => {
    it('should return a clone of the state', () => {
      const buffer = new StableBuffer({ initialState: { value: 'test' } });
      const state1 = buffer.read();
      const state2 = buffer.read();
      
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different references
    });

    it('should prevent external mutation of state via read()', () => {
      const buffer = new StableBuffer({ initialState: { value: 'original' } });
      const state = buffer.read();
      state.value = 'mutated';
      
      expect(buffer.read().value).toBe('original');
    });
  });

  describe('getState() method', () => {
    it('should return direct reference to internal state', () => {
      const buffer = new StableBuffer({ initialState: { value: 'test' } });
      const state1 = buffer.getState();
      const state2 = buffer.getState();
      
      expect(state1).toBe(state2); // Same reference
    });
  });

  describe('setState() method', () => {
    it('should replace the entire state', () => {
      const buffer = new StableBuffer({ initialState: { a: 1, b: 2 } });
      buffer.setState({ x: 10, y: 20 });
      
      expect(buffer.read()).toEqual({ x: 10, y: 20 });
    });
  });

  describe('run() method - Transaction execution', () => {
    it('should execute a synchronous transaction', async () => {
      const buffer = new StableBuffer({ initialState: { counter: 0 } });
      
      const result = await buffer.run((state) => {
        state.counter += 5;
        return state.counter;
      });
      
      expect(result).toBe(5);
      expect(buffer.read().counter).toBe(5);
    });

    it('should execute an asynchronous transaction', async () => {
      const buffer = new StableBuffer({ initialState: { counter: 0 } });
      
      const result = await buffer.run(async (state) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        state.counter += 10;
        return state.counter;
      });
      
      expect(result).toBe(10);
      expect(buffer.read().counter).toBe(10);
    });

    it('should execute transactions sequentially (queue)', async () => {
      const buffer = new StableBuffer({ initialState: { counter: 0 } });
      const executionOrder: number[] = [];
      
      const promises = [
        buffer.run(async (state) => {
          await new Promise(resolve => setTimeout(resolve, 50));
          state.counter += 1;
          executionOrder.push(1);
          return state.counter;
        }),
        buffer.run(async (state) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          state.counter += 2;
          executionOrder.push(2);
          return state.counter;
        }),
        buffer.run(async (state) => {
          state.counter += 3;
          executionOrder.push(3);
          return state.counter;
        })
      ];
      
      const results = await Promise.all(promises);
      
      // Should execute in order regardless of individual timing
      expect(executionOrder).toEqual([1, 2, 3]);
      expect(results).toEqual([1, 3, 6]);
      expect(buffer.read().counter).toBe(6);
    });

    it('should handle transaction errors without breaking the queue', async () => {
      const buffer = new StableBuffer({ initialState: { counter: 0 } });
      
      const successfulTask = buffer.run((state) => {
        state.counter = 5;
        return state.counter;
      });
      
      const failingTask = buffer.run(() => {
        throw new Error('Transaction failed');
      });
      
      const anotherSuccessfulTask = buffer.run((state) => {
        state.counter += 10;
        return state.counter;
      });
      
      await expect(successfulTask).resolves.toBe(5);
      await expect(failingTask).rejects.toThrow('Transaction failed');
      await expect(anotherSuccessfulTask).resolves.toBe(15);
      
      expect(buffer.read().counter).toBe(15);
    });
  });

  describe('update() method', () => {
    it('should update state without returning a value', async () => {
      const buffer = new StableBuffer({ initialState: { counter: 0 } });
      
      await buffer.update((state) => {
        state.counter = 42;
      });
      
      expect(buffer.read().counter).toBe(42);
    });

    it('should support async updates', async () => {
      const buffer = new StableBuffer({ initialState: { data: null } });
      
      await buffer.update(async (state) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        state.data = 'loaded';
      });
      
      expect(buffer.read().data).toBe('loaded');
    });
  });

  describe('transaction() method (alias)', () => {
    it('should work the same as run()', async () => {
      const buffer = new StableBuffer({ initialState: { value: 0 } });
      
      const result = await buffer.transaction((state) => {
        state.value = 100;
        return 'done';
      });
      
      expect(result).toBe('done');
      expect(buffer.read().value).toBe(100);
    });
  });

  describe('Transaction timeout', () => {
    it('should timeout if transaction takes too long', async () => {
      const buffer = new StableBuffer({
        initialState: {},
        transactionTimeoutMs: 50
      });
      
      await expect(
        buffer.run(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'completed';
        })
      ).rejects.toThrow('StableBuffer transaction timed out after 50ms');
    });

    it('should complete normally if within timeout', async () => {
      const buffer = new StableBuffer({
        initialState: {},
        transactionTimeoutMs: 200
      });
      
      const result = await buffer.run(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'completed';
      });
      
      expect(result).toBe('completed');
    });

    it('should not timeout when transactionTimeoutMs is 0 or undefined', async () => {
      const buffer = new StableBuffer({
        initialState: {},
        transactionTimeoutMs: 0
      });
      
      const result = await buffer.run(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'completed';
      });
      
      expect(result).toBe('completed');
    });
  });

  describe('getMetrics() method', () => {
    it('should return initial metrics with zero values', () => {
      const buffer = new StableBuffer();
      const metrics = buffer.getMetrics();
      
      expect(metrics.totalTransactions).toBe(0);
      expect(metrics.averageQueueWaitMs).toBe(0);
    });

    it('should track transaction count', async () => {
      const buffer = new StableBuffer({ initialState: {} });
      
      await buffer.run(() => 1);
      await buffer.run(() => 2);
      await buffer.run(() => 3);
      
      const metrics = buffer.getMetrics();
      expect(metrics.totalTransactions).toBe(3);
    });

    it('should calculate average queue wait time', async () => {
      const buffer = new StableBuffer({ initialState: {} });
      
      // Run concurrent transactions to create queue wait time
      await Promise.all([
        buffer.run(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
        }),
        buffer.run(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
        })
      ]);
      
      const metrics = buffer.getMetrics();
      expect(metrics.totalTransactions).toBe(2);
      expect(metrics.averageQueueWaitMs).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('StableBuffer - Custom Clone Function', () => {
  it('should use custom clone function when provided', () => {
    const cloneCalls: number[] = [];
    
    const buffer = new StableBuffer({
      initialState: { value: 1 },
      clone: (state) => {
        cloneCalls.push(Date.now());
        return { ...state, cloned: true };
      }
    });
    
    const state = buffer.read();
    expect(state.cloned).toBe(true);
    expect(cloneCalls.length).toBeGreaterThan(0);
  });

  it('should handle complex objects with custom clone', () => {
    const buffer = new StableBuffer({
      initialState: {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        date: new Date('2024-01-01')
      },
      clone: (state) => JSON.parse(JSON.stringify(state))
    });
    
    const state = buffer.read();
    expect(state.nested.deep.value).toBe('test');
    expect(state.array).toEqual([1, 2, 3]);
  });
});

describe('StableBuffer - Metrics Guardrails', () => {
  it('should validate metrics against guardrails', async () => {
    const buffer = new StableBuffer({
      initialState: {},
      metricsGuardrails: {
        totalTransactions: { max: 5 }
      }
    });
    
    // Run some transactions
    for (let i = 0; i < 3; i++) {
      await buffer.run(() => i);
    }
    
    const metrics = buffer.getMetrics();
    expect(metrics.validation).toBeDefined();
    expect(metrics.validation?.isValid).toBe(true);
  });

  it('should detect anomalies when guardrails are exceeded', async () => {
    const buffer = new StableBuffer({
      initialState: {},
      metricsGuardrails: {
        totalTransactions: { max: 2 }
      }
    });
    
    // Exceed the guardrail
    for (let i = 0; i < 5; i++) {
      await buffer.run(() => i);
    }
    
    const metrics = buffer.getMetrics();
    expect(metrics.validation).toBeDefined();
    expect(metrics.validation?.isValid).toBe(false);
    expect(metrics.validation?.anomalies.length).toBeGreaterThan(0);
  });
});
