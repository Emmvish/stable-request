export const REQUEST_METRICS_TO_VALIDATE_KEYS = [
    'totalAttempts',
    'successfulAttempts',
    'failedAttempts',
    'totalExecutionTime',
    'averageAttemptTime'
] as const;

export const CIRCUIT_BREAKER_METRICS_TO_VALIDATE_KEYS = [
    'failureRate',
    'totalRequests',
    'failedRequests'
] as const;

export const CACHE_METRICS_TO_VALIDATE_KEYS = [
    'hitRate',
    'missRate',
    'utilizationPercentage',
    'evictionRate'
] as const;

export const STABLE_BUFFER_METRICS_TO_VALIDATE_KEYS = [
    'totalTransactions',
    'averageQueueWaitMs'
] as const;
