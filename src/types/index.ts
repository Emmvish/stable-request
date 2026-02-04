import { AxiosRequestConfig } from 'axios';

import { 
  REQUEST_METHODS,
  RESPONSE_ERRORS, 
  RETRY_STRATEGIES,
  VALID_REQUEST_PROTOCOLS,
  AnomalySeverity,
  ViolationType,
  PersistenceStage,
  CircuitBreakerState
} from '../enums/index.js';

import { CircuitBreaker } from '../utilities/index.js';

export type CreateHash = (algorithm: string) => { update: (data: string) => { digest: (encoding: 'hex') => string } };
export type NodeCryptoLike = { createHash?: CreateHash };


export interface MetricGuardrail {
  min?: number;
  max?: number;
  expected?: number;
  tolerance?: number;
}

export interface MetricsGuardrailsRequest {
  totalAttempts?: MetricGuardrail;
  successfulAttempts?: MetricGuardrail;
  failedAttempts?: MetricGuardrail;
  totalExecutionTime?: MetricGuardrail;
  averageAttemptTime?: MetricGuardrail;
}

export interface MetricsGuardrailsCircuitBreaker {
  failureRate?: MetricGuardrail;
  totalRequests?: MetricGuardrail;
  failedRequests?: MetricGuardrail;
}

export interface MetricsGuardrailsCache {
  hitRate?: MetricGuardrail;
  missRate?: MetricGuardrail;
  utilizationPercentage?: MetricGuardrail;
  evictionRate?: MetricGuardrail;
}

export interface MetricsGuardrailsInfrastructure {
  circuitBreaker?: MetricsGuardrailsCircuitBreaker;
  cache?: MetricsGuardrailsCache;
}

export interface MetricsGuardrailsCommon {
  successRate?: MetricGuardrail;
  failureRate?: MetricGuardrail;
  executionTime?: MetricGuardrail;
  throughput?: MetricGuardrail;
}

export interface MetricsGuardrailsStableBuffer {
  totalTransactions?: MetricGuardrail;
  averageQueueWaitMs?: MetricGuardrail;
}

export interface MetricsGuardrails {
  request?: MetricsGuardrailsRequest;
  infrastructure?: MetricsGuardrailsInfrastructure;
  common?: MetricsGuardrailsCommon;
  stableBuffer?: MetricsGuardrailsStableBuffer;
}

export interface MetricAnomaly {
  metricName: string;
  metricValue: number;
  guardrail: MetricGuardrail;
  severity: AnomalySeverity;
  reason: string;
  violationType: ViolationType;
}

export interface MetricsValidationResult {
  isValid: boolean;
  anomalies: MetricAnomaly[];
  validatedAt: string;
}

export interface StableBufferMetrics {
  totalTransactions: number;
  averageQueueWaitMs: number;
  validation?: MetricsValidationResult;
}

export interface StableBufferTransactionOptions extends ExecutionContext {
  activity?: string;
  hookName?: string;
  hookParams?: any;
}

export interface StableBufferTransactionLog extends StableBufferTransactionOptions {
  transactionId: string;
  queuedAt: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  queueWaitMs: number;
  success: boolean;
  errorMessage?: string;
  stateBefore: Record<string, any>;
  stateAfter: Record<string, any>;
}

export type StableBufferTransactionLogger = (log: StableBufferTransactionLog) => void | Promise<void>;

export type StableBufferReplayHandler = (state: Record<string, any>, log: StableBufferTransactionLog) => void | Promise<void>;

export interface StableBufferReplayOptions {
  logs: StableBufferTransactionLog[];
  handlers: Record<string, StableBufferReplayHandler>;
  buffer?: BufferLike;
  initialState?: Record<string, any>;
  sort?: boolean;
  dedupe?: boolean;
  allowUnknownHooks?: boolean;
  activityFilter?: (log: StableBufferTransactionLog) => boolean;
  onApply?: (log: StableBufferTransactionLog) => void;
  onSkip?: (log: StableBufferTransactionLog, reason: 'filtered' | 'duplicate' | 'missing-handler') => void;
  onError?: (log: StableBufferTransactionLog, error: unknown) => void;
}

export interface StableBufferReplayResult {
  buffer: StableBufferInstance;
  applied: number;
  skipped: number;
  errors: Array<{ log: StableBufferTransactionLog; error: unknown }>;
}

export type TransactionLogsLoader = (context: ExecutionContext) => StableBufferTransactionLog[] | Promise<StableBufferTransactionLog[]>;

export type StableBufferState = Record<string, any>;

export interface StableBufferOptions {
  initialState?: StableBufferState;
  clone?: (state: StableBufferState) => StableBufferState;
  metricsGuardrails?: MetricsGuardrailsStableBuffer;
  transactionTimeoutMs?: number;
  logTransaction?: StableBufferTransactionLogger;
}

export interface ExecutionContext {
  workflowId?: string;
  branchId?: string;
  phaseId?: string;
  requestId?: string;
}

export interface StableBufferInstance {
  run<T>(fn: (state: StableBufferState) => T | Promise<T>, options?: StableBufferTransactionOptions): Promise<T>;
  read(): StableBufferState;
  getState(): StableBufferState;
  setState(state: StableBufferState): void;
}

export type BufferLike = Record<string, any> | StableBufferInstance;

export interface ERROR_LOG {
  timestamp: string;
  executionTime: number;
  statusCode: number;
  attempt: string;
  error: string;
  type: RESPONSE_ERROR_TYPES;
  isRetryable: boolean;
}

type RESPONSE_ERROR_TYPES = RESPONSE_ERRORS.HTTP_ERROR | RESPONSE_ERRORS.INVALID_CONTENT;

export interface ReqFnResponse<ResponseDataType = any> {
  ok: boolean;
  isRetryable: boolean;
  timestamp: string;
  executionTime: number;
  error?: string;
  statusCode: number;
  data?: ResponseDataType | { trialMode: TRIAL_MODE_OPTIONS };
  fromCache?: boolean;
}

export type REQUEST_METHOD_TYPES =
  | REQUEST_METHODS.GET
  | REQUEST_METHODS.POST
  | REQUEST_METHODS.DELETE
  | REQUEST_METHODS.PATCH
  | REQUEST_METHODS.PUT;

export type VALID_REQUEST_PROTOCOL_TYPES =
  | VALID_REQUEST_PROTOCOLS.HTTP
  | VALID_REQUEST_PROTOCOLS.HTTPS;

export interface REQUEST_DATA<RequestDataType = any> {
  hostname: string;
  protocol?: VALID_REQUEST_PROTOCOL_TYPES;
  method?: REQUEST_METHOD_TYPES;
  path?: `/${string}`;
  port?: number;
  headers?: Record<string, any>;
  body?: RequestDataType;
  query?: Record<string, any>;
  timeout?: number;
  signal?: AbortSignal;
}

export type RETRY_STRATEGY_TYPES = RETRY_STRATEGIES.FIXED | RETRY_STRATEGIES.LINEAR | RETRY_STRATEGIES.EXPONENTIAL;

interface ObservabilityHooksOptions<RequestDataType = any> {
  reqData: AxiosRequestConfig<RequestDataType>;
  params?: any;
  maxSerializableChars?: number;
  preExecutionResult?: any;
  commonBuffer?: Record<string, any>;
  executionContext?: ExecutionContext;
  transactionLogs?: StableBufferTransactionLog[];
}

interface AnalysisHookOptions<RequestDataType = any> extends Omit<ObservabilityHooksOptions<RequestDataType>, "maxSerializableChars"> {
  trialMode?: TRIAL_MODE_OPTIONS;
  params?: any;
  preExecutionResult?: any;
  executionContext?: ExecutionContext;
  commonBuffer?: Record<string, any>;
  transactionLogs?: StableBufferTransactionLog[];
}

export interface ResponseAnalysisHookOptions<RequestDataType = any, ResponseDataType = any> extends AnalysisHookOptions<RequestDataType> {
  data: ResponseDataType
}

export interface FinalErrorAnalysisHookOptions<RequestDataType = any> extends AnalysisHookOptions<RequestDataType> {
  error: any
}

export interface HandleErrorHookOptions<RequestDataType = any> extends ObservabilityHooksOptions<RequestDataType> {
  errorLog: ERROR_LOG
}

export interface HandleSuccessfulAttemptDataHookOptions<RequestDataType = any, ResponseDataType = any> extends ObservabilityHooksOptions<RequestDataType> {
  successfulAttemptData: SUCCESSFUL_ATTEMPT_DATA<ResponseDataType>
}

export interface HookParams {
  responseAnalyzerParams?: any;
  handleSuccessfulAttemptDataParams?: any;
  handleErrorsParams?: any;
  finalErrorAnalyzerParams?: any;
}

export interface PreExecutionHookOptions<RequestDataType = any, ResponseDataType = any> {
  inputParams?: any;
  commonBuffer?: Record<string, any>;
  stableRequestOptions: STABLE_REQUEST<RequestDataType, ResponseDataType>;
  transactionLogs?: StableBufferTransactionLog[];
}

export interface RequestPreExecutionOptions<RequestDataType = any, ResponseDataType = any> {
  preExecutionHook: (options: PreExecutionHookOptions<RequestDataType, ResponseDataType>) => any | Promise<any>;
  preExecutionHookParams?: any;
  applyPreExecutionConfigOverride?: boolean;
  continueOnPreExecutionHookFailure?: boolean;
}

export interface StatePersistenceOptions {
  executionContext: ExecutionContext;
  persistenceStage: PersistenceStage;
  params?: any;
  buffer: Record<string, any>;
}

export interface StatePersistenceConfig {
  persistenceFunction: (options: StatePersistenceOptions) => Promise<Record<string, any>> | Record<string, any>;
  persistenceParams?: any;
  loadBeforeHooks?: boolean;
  storeAfterHooks?: boolean;
}

export type InfrastructurePersistenceOperationType = 'load' | 'store';

export interface InfrastructurePersistenceOperation<TState> {
  operationId: string;
  type: InfrastructurePersistenceOperationType;
  timestamp: number;
  state?: TState;
}

export type InfrastructurePersistenceTransactionResult<TState> =
  | { state?: TState | null; skipped?: boolean }
  | TState
  | null
  | undefined
  | void;

export interface InfrastructurePersistence<TState> {
  load?: () => TState | null | undefined | Promise<TState | null | undefined>;
  store?: (state: TState) => void | Promise<void>;
  transaction?: (operation: InfrastructurePersistenceOperation<TState>) => InfrastructurePersistenceTransactionResult<TState> | Promise<InfrastructurePersistenceTransactionResult<TState>>;
  buffer?: BufferLike;
}

export interface CircuitBreakerPersistedState {
  state: CircuitBreakerState;
  totalRequests: number;
  failedRequests: number;
  successfulRequests: number;
  totalAttempts: number;
  failedAttempts: number;
  successfulAttempts: number;
  lastFailureTime: number;
  halfOpenRequests: number;
  halfOpenSuccesses: number;
  halfOpenFailures: number;
  stateTransitions: number;
  lastStateChangeTime: number;
  openCount: number;
  halfOpenCount: number;
  totalOpenDuration: number;
  lastOpenTime: number;
  recoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
}

export interface CircuitBreakerConfig {
  failureThresholdPercentage: number;
  minimumRequests: number;
  recoveryTimeoutMs: number;
  successThresholdPercentage?: number;
  halfOpenMaxRequests?: number;
  trackIndividualAttempts?: boolean;
  persistence?: InfrastructurePersistence<CircuitBreakerPersistedState>;
}

export interface CircuitBreakerDashboardMetrics {
  state: string;
  isHealthy: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  failurePercentage: number;
  stateTransitions: number;
  lastStateChangeTime: number;
  timeSinceLastStateChange: number;
  openCount: number;
  totalOpenDuration: number;
  averageOpenDuration: number;
  isCurrentlyOpen: boolean;
  openUntil: number | null;
  timeUntilRecovery: number | null;
  recoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  recoverySuccessRate: number;
  config: Required<Omit<CircuitBreakerConfig, 'persistence'>>;
}

export interface CacheManagerPersistedState {
  entries: Array<{
    key: string;
    value: CachedResponse;
  }>;
  accessOrder: string[];
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  expirations: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttl?: number;
  respectCacheControl?: boolean;
  cacheableStatusCodes?: number[];
  maxSize?: number;
  excludeMethods?: REQUEST_METHODS[];
  keyGenerator?: (config: AxiosRequestConfig) => string;
  persistence?: InfrastructurePersistence<CacheManagerPersistedState>;
}

export interface CachedResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, any>;
  timestamp: number;
  expiresAt: number;
}

export interface CacheDashboardMetrics {
  isEnabled: boolean;
  currentSize: number;
  maxSize: number;
  validEntries: number;
  expiredEntries: number;
  utilizationPercentage: number;
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  missRate: number;
  sets: number;
  evictions: number;
  expirations: number;
  averageGetTime: number;
  averageSetTime: number;
  averageCacheAge: number;
  oldestEntryAge: number | null;
  newestEntryAge: number | null;
  networkRequestsSaved: number;
  cacheEfficiency: number;
}

export interface TRIAL_MODE_OPTIONS {
  enabled: boolean;
  reqFailureProbability?: number;
  retryFailureProbability?: number;
}

export interface SUCCESSFUL_ATTEMPT_DATA<ResponseDataType = any> {
  attempt: string;
  timestamp: string;
  executionTime: number;
  data: ResponseDataType;
  statusCode: number;
}

export interface StableRequestInfrastructureMetrics {
  circuitBreaker?: CircuitBreakerDashboardMetrics;
  cache?: CacheDashboardMetrics;
}

export interface StableRequestMetrics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  totalExecutionTime: number;
  averageAttemptTime: number;
  infrastructureMetrics?: StableRequestInfrastructureMetrics;
  validation?: MetricsValidationResult;
}

export interface STABLE_REQUEST<RequestDataType = any, ResponseDataType = any> {
  reqData: REQUEST_DATA<RequestDataType>;
  responseAnalyzer?: (options: ResponseAnalysisHookOptions<RequestDataType, ResponseDataType>) => boolean | Promise<boolean>;
  resReq?: boolean;
  attempts?: number;
  performAllAttempts?: boolean;
  wait?: number;
  maxAllowedWait?: number;
  retryStrategy?: RETRY_STRATEGY_TYPES;
  jitter?: number;
  logAllErrors?: boolean;
  handleErrors?: (
    options: HandleErrorHookOptions<RequestDataType>
  ) => any | Promise<any>;
  logAllSuccessfulAttempts?: boolean;
  handleSuccessfulAttemptData?: (
    options: HandleSuccessfulAttemptDataHookOptions<RequestDataType, ResponseDataType>
  ) => any | Promise<any>;
  maxSerializableChars?: number;
  finalErrorAnalyzer?: (options: FinalErrorAnalysisHookOptions<RequestDataType>) => boolean | Promise<boolean>;
  trialMode?: TRIAL_MODE_OPTIONS;
  hookParams?: HookParams;
  preExecution?: RequestPreExecutionOptions;
  commonBuffer?: BufferLike;
  cache?: CacheConfig;
  executionContext?: ExecutionContext;
  circuitBreaker?: CircuitBreakerConfig | CircuitBreaker;
  statePersistence?: StatePersistenceConfig;
  metricsGuardrails?: MetricsGuardrails;
  throwOnFailedErrorAnalysis?: boolean;
  loadTransactionLogs?: TransactionLogsLoader;
  transactionLogs?: StableBufferTransactionLog[];
}

export interface STABLE_REQUEST_RESULT<ResponseDataType = any> {
  success: boolean;
  data?: ResponseDataType | boolean;
  error?: string;
  errorLogs?: ERROR_LOG[];
  successfulAttempts?: SUCCESSFUL_ATTEMPT_DATA<ResponseDataType>[];
  metrics?: StableRequestMetrics;
}
