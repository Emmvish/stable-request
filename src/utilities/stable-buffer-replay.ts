import { StableBuffer } from '../core/stable-buffer.js';
import { isStableBuffer } from './buffer-utils.js';
import type {
  BufferLike,
  StableBufferInstance,
  StableBufferReplayHandler,
  StableBufferReplayOptions,
  StableBufferReplayResult,
  StableBufferTransactionLog,
  StableBufferTransactionOptions
} from '../types/index.js';

const resolveBuffer = (buffer: BufferLike | undefined, initialState?: Record<string, any>): StableBufferInstance => {
  if (isStableBuffer(buffer)) {
    return buffer;
  }

  if (buffer && typeof buffer === 'object') {
    return new StableBuffer({ initialState: buffer });
  }

  return new StableBuffer({ initialState: initialState ?? {} });
};

const resolveTimestamp = (value?: string): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const orderLogs = (logs: StableBufferTransactionLog[]): StableBufferTransactionLog[] => {
  return [...logs].sort((a, b) => {
    const byStarted = resolveTimestamp(a.startedAt) - resolveTimestamp(b.startedAt);
    if (byStarted !== 0) return byStarted;
    const byQueued = resolveTimestamp(a.queuedAt) - resolveTimestamp(b.queuedAt);
    if (byQueued !== 0) return byQueued;
    return (a.transactionId || '').localeCompare(b.transactionId || '');
  });
};

const resolveHookHandler = (
  handlerMap: Record<string, StableBufferReplayHandler>,
  hookName?: string
): StableBufferReplayHandler | undefined => {
  if (!hookName) return undefined;
  return handlerMap[hookName];
};

export async function replayStableBufferTransactions(
  options: StableBufferReplayOptions
): Promise<StableBufferReplayResult> {
  const {
    logs,
    handlers,
    buffer,
    initialState,
    allowUnknownHooks = false,
    dedupe = true,
    activityFilter,
    sort = true,
    onApply,
    onSkip,
    onError
  } = options;

  const resolvedBuffer = resolveBuffer(buffer, initialState);
  const orderedLogs = sort ? orderLogs(logs) : logs;
  const appliedIds = new Set<string>();
  let applied = 0;
  let skipped = 0;
  const errors: Array<{ log: StableBufferTransactionLog; error: unknown }> = [];

  for (const log of orderedLogs) {
    if (activityFilter && !activityFilter(log)) {
      skipped += 1;
      onSkip?.(log, 'filtered');
      continue;
    }

    if (dedupe && log.transactionId && appliedIds.has(log.transactionId)) {
      skipped += 1;
      onSkip?.(log, 'duplicate');
      continue;
    }

    const handler = resolveHookHandler(handlers, log.hookName);
    if (!handler) {
      if (!allowUnknownHooks) {
        const error = new Error(`No replay handler registered for hook '${log.hookName ?? 'unknown'}'`);
        errors.push({ log, error });
        onError?.(log, error);
        continue;
      }

      skipped += 1;
      onSkip?.(log, 'missing-handler');
      continue;
    }

    const transactionOptions: StableBufferTransactionOptions = {
      activity: 'replay',
      hookName: log.hookName,
      hookParams: log.hookParams,
      workflowId: log.workflowId,
      branchId: log.branchId,
      phaseId: log.phaseId,
      requestId: log.requestId
    };

    try {
      await resolvedBuffer.run((state) => handler(state, log), transactionOptions);
      applied += 1;
      if (dedupe && log.transactionId) {
        appliedIds.add(log.transactionId);
      }
      onApply?.(log);
    } catch (error) {
      errors.push({ log, error });
      onError?.(log, error);
    }
  }

  return {
    buffer: resolvedBuffer,
    applied,
    skipped,
    errors
  };
}
