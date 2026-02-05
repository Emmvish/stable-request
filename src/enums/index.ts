export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export enum INVALID_AXIOS_RESPONSES {
  RESET = 'ECONNRESET',
  TIMEDOUT = 'ETIMEDOUT',
  REFUSED = 'ECONNREFUSED',
  NOTFOUND = 'ENOTFOUND',
  EAI_AGAIN = 'EAI_AGAIN',
}

export enum REQUEST_METHODS {
  GET = 'GET',
  POST = 'POST',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  PUT = 'PUT',
}

export enum RESPONSE_ERRORS {
  HTTP_ERROR = 'HTTP_ERROR',
  INVALID_CONTENT = 'INVALID_CONTENT',
}

export enum RETRY_STRATEGIES {
  FIXED = 'fixed',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
}

export enum VALID_REQUEST_PROTOCOLS {
  HTTP = 'http',
  HTTPS = 'https',
}

export enum AnomalySeverity {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info'
}

export enum ViolationType {
  BELOW_MIN = 'below_min',
  ABOVE_MAX = 'above_max',
  OUTSIDE_TOLERANCE = 'outside_tolerance'
}

export enum PersistenceStage {
  BEFORE_HOOK = 'before_hook',
  AFTER_HOOK = 'after_hook'
}

export enum SkipReason {
  FILTERED = 'filtered',
  DUPLICATE = 'duplicate',
  MISSING_HANDLER = 'missing-handler'
}

export enum InfrastructurePersistenceOperationTypes {
  LOAD = 'load',
  STORE = 'store'
}
