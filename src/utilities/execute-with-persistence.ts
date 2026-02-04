import { PersistenceStage } from '../enums/index.js';
import { BufferLike, StatePersistenceConfig, ExecutionContext, StableBufferTransactionOptions } from '../types/index.js';
import { safelyExecuteUnknownFunction } from './safely-execute-unknown-function.js';
import { formatLogContext } from './format-log-context.js';
import { withBuffer } from './buffer-utils.js';

export async function executeWithPersistence<T = any>(
  hookFn: Function,
  hookOptions: any,
  persistenceConfig?: StatePersistenceConfig,
  executionContext: ExecutionContext = {},
  buffer?: BufferLike,
  bufferTransactionOptions: StableBufferTransactionOptions = {}
): Promise<T> {
  const hookName = typeof hookFn === 'function' && hookFn.name ? hookFn.name : 'anonymous-hook';
  const resolvedTransactionOptions: StableBufferTransactionOptions = {
    ...executionContext,
    ...bufferTransactionOptions,
    activity: bufferTransactionOptions.activity ?? 'hook',
    hookName: bufferTransactionOptions.hookName ?? hookName,
    hookParams: bufferTransactionOptions.hookParams ?? hookOptions
  };

  return withBuffer(buffer, async (bufferState) => {
    if (persistenceConfig?.loadBeforeHooks && persistenceConfig.persistenceFunction) {
      try {
        const loadedState = await safelyExecuteUnknownFunction(
          persistenceConfig.persistenceFunction,
          {
            executionContext,
            params: persistenceConfig.persistenceParams,
            buffer: { ...bufferState },
            persistenceStage: PersistenceStage.BEFORE_HOOK
          }
        );
        
        if (loadedState && typeof loadedState === 'object') {
          Object.assign(bufferState, loadedState);
        }
      } catch (error: any) {
        console.error(
          `${formatLogContext(executionContext)}stable-request: \nState persistence: Failed to load state before hook execution: ${error.message}`
        );
      }
    }

    const resolvedHookOptions = { ...hookOptions };
    if (resolvedHookOptions && typeof resolvedHookOptions === 'object') {
      if ('commonBuffer' in resolvedHookOptions) {
        resolvedHookOptions.commonBuffer = bufferState;
      }
      if ('sharedBuffer' in resolvedHookOptions) {
        resolvedHookOptions.sharedBuffer = bufferState;
      }
      if ('buffer' in resolvedHookOptions) {
        resolvedHookOptions.buffer = bufferState;
      }
    }

    const result = await safelyExecuteUnknownFunction(hookFn, resolvedHookOptions);

    if (persistenceConfig?.storeAfterHooks && persistenceConfig.persistenceFunction) {
      try {
        await safelyExecuteUnknownFunction(
          persistenceConfig.persistenceFunction,
          {
            executionContext,
            params: persistenceConfig.persistenceParams,
            buffer: { ...bufferState },
            persistenceStage: PersistenceStage.AFTER_HOOK
          }
        );
      } catch (error: any) {
        console.error(
          `${formatLogContext(executionContext)}stable-request: \nState persistence: Failed to store state after hook execution: ${error.message}`
        );
      }
    }

    return result;
  }, resolvedTransactionOptions);
}
