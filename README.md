# stable-request 🔒

> ⚠️ **Maintenance Mode Notice**: This library is now in maintenance mode. For the full-featured execution engine with workflows, schedulers, API gateways, and more, please use [**stable-infra**](https://npmjs.com/package/@emmvish/stable-infra) - the natural evolution of stable-request. If you wish to continue using stable-request for workflows / gateway / scheduling, then, refer to its docs in version 2.8.5.

A resilient HTTP request framework for Node.js with built-in intelligent retry strategies, circuit breakers, caching, state persistence, and comprehensive observability. 
I created this framework when I was integrating with **unreliable, flaky APIs** and needed a simple solution for retrying the requests. While such libraries do exist already, I needed something more... an intelligent, fully customizable and stable framework that would not throw errors randomly, but rather, give me only the most important information on why my requests were failing or succeeding, with metrics and type-safety.

## 🚀 Try stable-infra Instead

**stable-request** has evolved into **stable-infra** - a complete execution infrastructure that includes:

- Everything in `stable-request` and more updates
- `stableWorkflow` - Multi-phase workflow orchestration with branching
- `stableApiGateway` - Batch request execution with grouping
- `stableFunction` - Resilient function execution with retries
- `stableWorkflowGraph` - DAG-based workflow execution
- `StableScheduler` - Job scheduling with cron, intervals, and timestamps
- `StableBuffer` - A safe shared-state buffer for all the stable modules
- `stableRunner` - CLI runner for all execution types

**[Get started with stable-infra →](https://npmjs.com/package/@emmvish/stable-infra)**

---

## Installation

```bash
npm install stable-request
```

## Why stable-request?

Traditional retry libraries blindly retry on network failures or non-2xx HTTP status codes. But in the real world, **HTTP 200 doesn't always mean success**:

- ✅ An API returns `200 OK` with `{ "status": "pending" }` - you need to retry until it's `"completed"`
- ✅ A payment gateway returns `200 OK` but the transaction is still processing
- ✅ A search API returns `200 OK` with empty results due to eventual consistency
- ✅ An external API returns `200 OK` with `{ "error": "rate_limited" }` in the body
- ✅ You need to validate response data against business rules before accepting it

**stable-request** lets you inject business intelligence into every stage of the request lifecycle through **hooks** - making your HTTP requests truly resilient to both infrastructure and business-level failures.

## Features

### 🔄 Configurable Retry Strategies

Automatically retry failed requests with customizable backoff strategies:

```typescript
import { stableRequest, RETRY_STRATEGIES, REQUEST_METHODS } from 'stable-request';
import type { STABLE_REQUEST_RESULT } from 'stable-request';

interface ApiResponse {
  data: string[];
  total: number;
}

(async () => {
  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: {
      hostname: 'api.example.com',
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    attempts: 5,
    wait: 1000,
    retryStrategy: RETRY_STRATEGIES.EXPONENTIAL,  // FIXED, LINEAR, or EXPONENTIAL
    jitter: 0.2,  // Add ±20% randomness to delays
    maxAllowedWait: 30000  // Cap maximum wait time
  });

  if (result.success) {
    console.log('Data:', result.data);
  }
})();
```

### ⚡ Circuit Breaker Pattern

Protect your services from cascading failures:

```typescript
import { stableRequest, REQUEST_METHODS } from 'stable-request';
import type { STABLE_REQUEST_RESULT, CircuitBreakerConfig } from 'stable-request';

interface ApiResponse {
  status: string;
}

(async () => {
  const circuitBreakerConfig: CircuitBreakerConfig = {
    failureThresholdPercentage: 50,  // Open circuit at 50% failure rate
    minimumRequests: 10,              // Minimum requests before evaluation
    recoveryTimeoutMs: 30000,         // Time before attempting recovery
    halfOpenMaxRequests: 5,           // Requests allowed in half-open state
    trackIndividualAttempts: true     // Track each retry attempt
  };

  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    circuitBreaker: circuitBreakerConfig
  });
})();
```

### 💾 Intelligent Response Caching

Cache responses with full HTTP cache-control support:

```typescript
import { stableRequest, REQUEST_METHODS } from 'stable-request';
import type { STABLE_REQUEST_RESULT, CacheConfig } from 'stable-request';

interface ApiResponse {
  items: { id: number; name: string }[];
}

(async () => {
  const cacheConfig: CacheConfig = {
    enabled: true,
    ttl: 300000,               // 5 minutes default TTL
    maxSize: 100,              // Maximum cache entries
    respectCacheControl: true, // Honor HTTP cache headers
    cacheableStatusCodes: [200, 203, 204, 206, 300, 301],
    excludeMethods: [REQUEST_METHODS.POST, REQUEST_METHODS.PUT, REQUEST_METHODS.PATCH, REQUEST_METHODS.DELETE]
  };

  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    cache: cacheConfig
  });
})();
```

### 🔒 StableBuffer - Thread-Safe State Management

Manage shared state safely across concurrent operations:

```typescript
import { StableBuffer } from 'stable-request';
import type { StableBufferOptions, StableBufferTransactionLog, StableBufferState } from 'stable-request';

interface BufferState extends StableBufferState {
  counter: number;
  items: { id: number; timestamp: number }[];
}

(async () => {
  const bufferOptions: StableBufferOptions = {
    initialState: { counter: 0, items: [] } as BufferState,
    transactionTimeoutMs: 5000,
    logTransaction: async (log: StableBufferTransactionLog): Promise<void> => {
      // Persist transaction logs for replay/audit
      await saveToDatabase(log);
    }
  };

  const buffer = new StableBuffer(bufferOptions);

  // Safe concurrent updates
  await buffer.run(async (state): Promise<void> => {
    const typedState = state as BufferState;
    typedState.counter += 1;
    typedState.items.push({ id: typedState.counter, timestamp: Date.now() });
  });

  // Read state (returns a clone)
  const currentState = buffer.read() as BufferState;
})();
```

### 📜 Transaction Logs & State Replay

Replay transactions for recovery or auditing:

```typescript
import { replayStableBufferTransactions } from 'stable-request';
import type { StableBufferTransactionLog, StableBufferReplayResult, StableBufferReplayHandler } from 'stable-request';

interface OrderState {
  orders: string[];
  inventory: Record<string, number>;
}

interface OrderHookParams {
  orderId: string;
}

interface InventoryHookParams {
  sku: string;
  quantity: number;
}

(async () => {
  // Load saved transaction logs
  const logs: StableBufferTransactionLog[] = await loadTransactionLogsFromDB();

  // Define replay handlers
  const handlers: Record<string, StableBufferReplayHandler> = {
    'processOrder': async (state, log): Promise<void> => {
      const typedState = state as OrderState;
      const params = log.hookParams as OrderHookParams;
      typedState.orders.push(params.orderId);
    },
    'updateInventory': async (state, log): Promise<void> => {
      const typedState = state as OrderState;
      const params = log.hookParams as InventoryHookParams;
      typedState.inventory[params.sku] -= params.quantity;
    }
  };

  // Replay with custom handlers
  const result: StableBufferReplayResult = await replayStableBufferTransactions({
    logs,
    handlers,
    initialState: { orders: [], inventory: {} } as OrderState,
    dedupe: true,     // Skip duplicate transactions
    sort: true        // Order by timestamp
  });

  console.log('Replayed state:', result.buffer.read() as OrderState);
})();
```

### 💾 State Persistence

Persist and restore state across executions:

```typescript
import { stableRequest, StableBuffer, PersistenceStage, REQUEST_METHODS } from 'stable-request';
import type { STABLE_REQUEST_RESULT, StatePersistenceConfig, StatePersistenceOptions } from 'stable-request';

interface ApiResponse {
  data: string;
}

interface BufferState {
  lastFetched: string | null;
}

(async () => {
  const buffer = new StableBuffer({
    initialState: { lastFetched: null } as BufferState
  });

  const statePersistence: StatePersistenceConfig = {
    persistenceFunction: async (options: StatePersistenceOptions): Promise<Record<string, any>> => {
      const { executionContext, buffer, persistenceStage } = options;
      if (persistenceStage === PersistenceStage.BEFORE_HOOK) {
        return await loadStateFromDB(executionContext);
      } else {
        await saveStateToDB(executionContext, buffer);
        return buffer;
      }
    },
    loadBeforeHooks: true,
    storeAfterHooks: true
  };

  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    commonBuffer: buffer,
    statePersistence
  });
})();
```

### 🪝 Lifecycle Hooks

Tap into every stage of request execution:

```typescript
import { stableRequest, REQUEST_METHODS } from 'stable-request';
import type { 
  STABLE_REQUEST_RESULT, 
  STABLE_REQUEST,
  PreExecutionHookOptions,
  ResponseAnalysisHookOptions,
  HandleErrorHookOptions,
  HandleSuccessfulAttemptDataHookOptions,
  FinalErrorAnalysisHookOptions
} from 'stable-request';

interface ApiResponse {
  status: 'success' | 'pending' | 'failed';
  data?: unknown;
}

(async () => {
  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,  // Return response data
    
    // Pre-execution hook
    preExecution: {
      preExecutionHook: async (options: PreExecutionHookOptions<void, ApiResponse>): Promise<Partial<STABLE_REQUEST<void, ApiResponse>>> => {
        const { inputParams, commonBuffer, stableRequestOptions } = options;
        // Modify options before execution
        return { 
          reqData: {
            ...stableRequestOptions.reqData,
            headers: { 'X-Custom': 'value' }
          }
        };
      },
      applyPreExecutionConfigOverride: true
    },
    
    // Response validation
    responseAnalyzer: async (options: ResponseAnalysisHookOptions<void, ApiResponse>): Promise<boolean> => {
      const { data, trialMode, commonBuffer } = options;
      return data.status === 'success';  // Return true if response is valid
    },
    
    // Error handling
    logAllErrors: true,
    handleErrors: async (options: HandleErrorHookOptions<void>): Promise<void> => {
      const { reqData, errorLog, commonBuffer } = options;
      await logToMonitoring(errorLog);
    },
    
    // Success tracking
    logAllSuccessfulAttempts: true,
    handleSuccessfulAttemptData: async (options: HandleSuccessfulAttemptDataHookOptions<void, ApiResponse>): Promise<void> => {
      const { successfulAttemptData } = options;
      await trackMetric('request_success', successfulAttemptData);
    },
    
    // Final error analysis
    finalErrorAnalyzer: async (options: FinalErrorAnalysisHookOptions<void>): Promise<boolean> => {
      const { error, commonBuffer } = options;
      return error.message.includes('temporary');  // Return true if handled
    }
  });
})();
```

---

## 🎣 Hook Reference

stable-request provides **5 hooks** that let you inject business logic into the request lifecycle. Each hook serves a specific purpose and receives contextual information to make intelligent decisions.

### Hook Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         stableRequest() called                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  1. preExecutionHook                                                    │
│     • Modify request config, inject auth tokens, validate inputs        │
│     • Can override any stableRequest option                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      Execute HTTP Request     │
                    │        (attempt 1 of N)       │
                    └───────────────────────────────┘
                           │               │
                     Success (2xx)    Network/HTTP Error
                           │               │
                           ▼               ▼
┌──────────────────────────────────┐  ┌─────────────────────────────────────┐
│  2. responseAnalyzer             │  │  3. handleErrors                    │
│     • Validate business logic    │  │     • Log error, alert, track       │
│     • Return false = retry       │  │     • Called for each failed attempt│
└──────────────────────────────────┘  └─────────────────────────────────────┘
         │           │                              │
    Return true  Return false                       │
    (valid)      (invalid = retry)                  │
         │           │                              │
         │           └──────────────────────────────┤
         │                                          │
         ▼                                          ▼
┌──────────────────────────────────┐     ┌─────────────────────────────────┐
│  4. handleSuccessfulAttemptData  │     │  (Retry with backoff if         │
│     • Track successful attempts  │     │   attempts remaining)            │
│     • Audit logging              │     └─────────────────────────────────┘
└──────────────────────────────────┘                │
         │                                          │
         │                         All attempts exhausted
         │                                          │
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Return Result                              │
│                                    │                                    │
│                    ┌───────────────┴───────────────┐                    │
│               success: true                   success: false            │
│                                                    │                    │
│                                                    ▼                    │
│                              ┌─────────────────────────────────────┐    │
│                              │  5. finalErrorAnalyzer              │    │
│                              │     • Analyze final failure         │    │
│                              │     • Determine if error is fatal   │    │
│                              │     • Control throwOnFailedError    │    │
│                              └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 1. `preExecutionHook` - Pre-Request Setup

Called **once** before any attempt is made. Use it to modify request configuration, inject dynamic values, or validate preconditions.

```typescript
import { stableRequest, REQUEST_METHODS } from 'stable-request';
import type { 
  STABLE_REQUEST_RESULT, 
  STABLE_REQUEST,
  PreExecutionHookOptions,
  RequestPreExecutionOptions
} from 'stable-request';

interface OrderRequest {
  productId: string;
  quantity: number;
}

interface OrderResponse {
  orderId: string;
  status: string;
}

(async () => {
  const preExecutionConfig: RequestPreExecutionOptions<OrderRequest, OrderResponse> = {
    preExecutionHook: async (options: PreExecutionHookOptions<OrderRequest, OrderResponse>): Promise<Partial<STABLE_REQUEST<OrderRequest, OrderResponse>>> => {
      const { inputParams, commonBuffer, stableRequestOptions, transactionLogs } = options;
      
      // Inject fresh auth token
      const token: string = await getAuthToken();
      
      // Validate business preconditions
      if (!commonBuffer?.userId) {
        throw new Error('User ID required');
      }
      
      // Return partial config to merge (if applyPreExecutionConfigOverride is true)
      return {
        reqData: {
          ...stableRequestOptions.reqData,
          headers: {
            ...stableRequestOptions.reqData.headers,
            'Authorization': `Bearer ${token}`,
            'X-User-Id': commonBuffer.userId
          }
        }
      };
    },
    preExecutionHookParams: { customData: 'value' },  // Passed as inputParams
    applyPreExecutionConfigOverride: true,             // Merge returned config
    continueOnPreExecutionHookFailure: false           // Fail fast if hook throws
  };

  const result: STABLE_REQUEST_RESULT<OrderResponse> = await stableRequest<OrderRequest, OrderResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/orders',
      method: REQUEST_METHODS.POST
    },
    resReq: true,
    preExecution: preExecutionConfig
  });
})();
```

**💡 Use cases:**
- Inject fresh authentication tokens
- Add request signing/HMAC
- Validate preconditions before making the request
- Dynamically modify endpoints based on state
- Load configuration from external sources

---

### 2. `responseAnalyzer` - Business Logic Validation

Called after **each successful HTTP response** (2xx status). This is where you validate that the response meets your business requirements.

> **Key insight:** Return `true` if the response is acceptable, `false` to trigger a retry.

```typescript
import { stableRequest, StableBuffer, REQUEST_METHODS, RETRY_STRATEGIES } from 'stable-request';
import type { 
  STABLE_REQUEST_RESULT, 
  ResponseAnalysisHookOptions,
  HookParams
} from 'stable-request';

interface PaymentRequest {
  cardToken: string;
  amount: number;
}

interface PaymentResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transactionId?: string;
  receiptUrl?: string;
  amount?: number;
  error?: string;
  errorCode?: string;
}

(async () => {
  // Create buffer to track state across retries
  const buffer = new StableBuffer({
    initialState: { expectedAmount: 100, transactionId: null }
  });

  const hookParams: HookParams = {
    responseAnalyzerParams: { expectedStatus: 'completed' }  // Passed as params
  };

  const result: STABLE_REQUEST_RESULT<PaymentResponse> = await stableRequest<PaymentRequest, PaymentResponse>({
    reqData: { 
      hostname: 'payment.api.com', 
      path: '/charge',
      method: REQUEST_METHODS.POST,
      body: { cardToken: 'tok_xxx', amount: 100 }
    },
    resReq: true,  // Must be true to receive response data
    attempts: 5,
    retryStrategy: RETRY_STRATEGIES.EXPONENTIAL,
    commonBuffer: buffer,
    
    responseAnalyzer: async (options: ResponseAnalysisHookOptions<PaymentRequest, PaymentResponse>): Promise<boolean> => {
      const { reqData, data, trialMode, params, commonBuffer, executionContext } = options;
      
      // Example 1: Wait for async processing to complete
      if (data.status === 'pending' || data.status === 'processing') {
        console.log('Payment still processing, will retry...');
        return false;  // Retry
      }
      
      // Example 2: Validate response has required data
      if (!data.transactionId || !data.receiptUrl) {
        console.log('Incomplete response, will retry...');
        return false;  // Retry
      }
      
      // Example 3: Check for soft errors in response body
      if (data.error || data.errorCode) {
        console.log(`Soft error: ${data.errorCode}, will retry...`);
        return false;  // Retry
      }
      
      // Example 4: Validate against business rules
      if (data.amount !== commonBuffer?.expectedAmount) {
        console.log('Amount mismatch, will retry...');
        return false;  // Retry
      }
      
      // Success - accept this response
      if (commonBuffer) {
        commonBuffer.transactionId = data.transactionId;
      }
      return true;
    },
    
    hookParams
  });
})();
```

**💡 Use cases:**
- Poll until async operation completes (`status: pending` → `status: completed`)
- Validate response data integrity
- Check for soft errors in response body (APIs that return 200 with error payloads)
- Ensure eventual consistency (retry until data propagates)
- Validate business invariants

---

### 3. `handleErrors` - Error Observation & Logging

Called after **each failed attempt** (network error, non-2xx status, or `responseAnalyzer` returning `false`). Use for observability - this hook doesn't affect retry behavior.

> **Note:** Only called when `logAllErrors: true`

```typescript
import { stableRequest, StableBuffer, REQUEST_METHODS, RETRY_STRATEGIES } from 'stable-request';
import type { 
  STABLE_REQUEST_RESULT, 
  HandleErrorHookOptions,
  ERROR_LOG,
  HookParams
} from 'stable-request';

interface ApiResponse {
  data: unknown;
}

interface ErrorHistoryEntry {
  timestamp: string;
  attempt: string;
  error: string;
  statusCode: number;
}

(async () => {
  // Create buffer to track errors
  const buffer = new StableBuffer({
    initialState: { errorHistory: [] as ErrorHistoryEntry[] }
  });

  const hookParams: HookParams = {
    handleErrorsParams: { alertChannel: '#api-errors' }
  };

  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    attempts: 3,
    retryStrategy: RETRY_STRATEGIES.EXPONENTIAL,
    logAllErrors: true,  // Required to trigger handleErrors
    commonBuffer: buffer,
    
    handleErrors: async (options: HandleErrorHookOptions<void>): Promise<void> => {
      const { reqData, errorLog, maxSerializableChars, params, commonBuffer, executionContext } = options;
      
      // errorLog contains detailed error information
      const { timestamp, attempt, error, type, isRetryable, executionTime, statusCode }: ERROR_LOG = errorLog;
      
      // Log to monitoring system
      await sendToDatadog({
        level: 'error',
        message: error,
        tags: {
          attempt,
          statusCode,
          isRetryable,
          workflowId: executionContext?.workflowId,
          requestId: executionContext?.requestId
        },
        executionTime
      });
      
      // Track in shared buffer for analysis
      if (commonBuffer) {
        commonBuffer.errorHistory = commonBuffer.errorHistory || [];
        commonBuffer.errorHistory.push({
          timestamp,
          attempt,
          error,
          statusCode
        });
      }
      
      // Alert on specific error types
      if (statusCode === 503) {
        await sendSlackAlert(`Service unavailable: ${reqData.url}`);
      }
    },
    
    hookParams
  });
})();
```

**Error Log Structure:**
```typescript
interface ERROR_LOG {
  timestamp: string;      // ISO timestamp of the error
  attempt: string;        // e.g., "2/5" (attempt 2 of 5)
  error: string;          // Error message
  type: 'HTTP_ERROR' | 'INVALID_CONTENT';  // HTTP error or responseAnalyzer rejection
  isRetryable: boolean;   // Whether this error qualifies for retry
  executionTime: number;  // Time taken for this attempt (ms)
  statusCode: number;     // HTTP status code (0 for network errors)
}
```

**💡 Use cases:**
- Send errors to monitoring (Datadog, New Relic, Sentry)
- Track error patterns for circuit breaker decisions
- Alert on specific error types
- Build error history for debugging
- Audit logging

---

### 4. `handleSuccessfulAttemptData` - Success Observation

Called after **each successful attempt** (HTTP 2xx + `responseAnalyzer` returns `true`). Use for observability and tracking.

> **Note:** Only called when `logAllSuccessfulAttempts: true`. Most useful with `performAllAttempts: true` for polling scenarios.

```typescript
import { stableRequest, StableBuffer, REQUEST_METHODS, RETRY_STRATEGIES } from 'stable-request';
import type { 
  STABLE_REQUEST_RESULT, 
  HandleSuccessfulAttemptDataHookOptions,
  SUCCESSFUL_ATTEMPT_DATA
} from 'stable-request';

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
}

interface ResponseHistoryEntry {
  attempt: string;
  timestamp: string;
  status: string;
  latency: number;
}

(async () => {
  // Create buffer to track response history
  const buffer = new StableBuffer({
    initialState: { responseHistory: [] as ResponseHistoryEntry[] }
  });

  const result: STABLE_REQUEST_RESULT<HealthResponse> = await stableRequest<void, HealthResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/health',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    attempts: 10,
    retryStrategy: RETRY_STRATEGIES.LINEAR,
    performAllAttempts: true,          // Continue even after success
    logAllSuccessfulAttempts: true,    // Required to trigger this hook
    commonBuffer: buffer,
    
    handleSuccessfulAttemptData: async (options: HandleSuccessfulAttemptDataHookOptions<void, HealthResponse>): Promise<void> => {
      const { reqData, successfulAttemptData, maxSerializableChars, params, commonBuffer } = options;
      const { attempt, timestamp, data, executionTime, statusCode }: SUCCESSFUL_ATTEMPT_DATA<HealthResponse> = successfulAttemptData;
      
      // Track latency metrics
      await sendMetric('api_latency', executionTime, {
        endpoint: reqData.url,
        attempt
      });
      
      // Build response history (useful for polling scenarios)
      if (commonBuffer) {
        commonBuffer.responseHistory = commonBuffer.responseHistory || [];
        commonBuffer.responseHistory.push({
          attempt,
          timestamp,
          status: data.status,
          latency: executionTime
        });
      }
      
      // Log successful recovery
      if (attempt !== '1/10') {
        console.log(`Recovered on attempt ${attempt} after ${executionTime}ms`);
      }
    }
  });
})();
```

**Successful Attempt Data Structure:**
```typescript
interface SUCCESSFUL_ATTEMPT_DATA<ResponseDataType> {
  attempt: string;        // e.g., "3/5"
  timestamp: string;      // ISO timestamp
  data: ResponseDataType; // Response data
  executionTime: number;  // Time taken (ms)
  statusCode: number;     // HTTP status code
}
```

**💡 Use cases:**
- Track latency percentiles
- Monitor recovery patterns (which attempts succeed?)
- Build response history for polling workflows
- Celebrate successful retries in observability dashboards

---

### 5. `finalErrorAnalyzer` - Final Failure Analysis

Called **once** when all retry attempts have been exhausted and the request has failed. This is your last chance to analyze the failure and decide how to handle it.

> **Key insight:** Return `true` if you've handled the error gracefully, `false` to let it propagate. Works with `throwOnFailedErrorAnalysis` option.

```typescript
import { stableRequest, StableBuffer, REQUEST_METHODS, RETRY_STRATEGIES } from 'stable-request';
import type { 
  STABLE_REQUEST_RESULT, 
  FinalErrorAnalysisHookOptions,
  HookParams,
  ERROR_LOG
} from 'stable-request';

interface CriticalResponse {
  result: string;
}

(async () => {
  // Create buffer with fallback state
  const buffer = new StableBuffer({
    initialState: {
      errorHistory: [] as ERROR_LOG[],
      isMaintenanceMode: false,
      cachedResponse: null as CriticalResponse | null,
      useFallback: false
    }
  });

  const hookParams: HookParams = {
    finalErrorAnalyzerParams: { allowFailure: false }
  };

  const result: STABLE_REQUEST_RESULT<CriticalResponse> = await stableRequest<void, CriticalResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/critical-operation',
      method: REQUEST_METHODS.POST
    },
    resReq: true,
    attempts: 5,
    retryStrategy: RETRY_STRATEGIES.EXPONENTIAL,
    throwOnFailedErrorAnalysis: true,  // Throw if finalErrorAnalyzer returns false
    commonBuffer: buffer,
    
    finalErrorAnalyzer: async (options: FinalErrorAnalysisHookOptions<void>): Promise<boolean> => {
      const { reqData, error, trialMode, params, commonBuffer, executionContext } = options;
      
      // Log comprehensive failure report
      await logFinalFailure({
        request: reqData,
        error: error.message,
        errorHistory: commonBuffer?.errorHistory,
        context: executionContext
      });
      
      // Check if this is a known/acceptable failure
      if (error.message.includes('MAINTENANCE_MODE')) {
        if (commonBuffer) commonBuffer.isMaintenanceMode = true;
        return true;  // Handled - won't throw
      }
      
      // Check if we should fall back to cached data
      if (commonBuffer?.cachedResponse) {
        commonBuffer.useFallback = true;
        return true;  // Handled - use fallback
      }
      
      // Check if this is a non-critical operation
      if (params?.allowFailure) {
        return true;  // Handled - operation is optional
      }
      
      // Unhandled critical failure
      await sendPagerDutyAlert({
        severity: 'critical',
        message: `Critical API failure after 5 attempts`,
        context: executionContext
      });
      
      return false;  // Not handled - will throw if throwOnFailedErrorAnalysis is true
    },
    
    hookParams
  });
})();
```

**💡 Use cases:**
- Comprehensive failure reporting
- Determine if failure is recoverable vs. fatal
- Trigger fallback mechanisms
- Escalate to PagerDuty/on-call
- Mark operation as gracefully degraded
- Decide whether to throw or return error result

---

### Hook Parameters Summary

All hooks receive contextual information through their options parameter:

| Parameter | Description | Available In |
|-----------|-------------|--------------|
| `reqData` | Axios request configuration | responseAnalyzer, handleErrors, handleSuccessfulAttemptData, finalErrorAnalyzer |
| `data` | Response data | responseAnalyzer |
| `error` | Error object | finalErrorAnalyzer |
| `errorLog` | Detailed error information | handleErrors |
| `successfulAttemptData` | Success details | handleSuccessfulAttemptData |
| `trialMode` | Trial mode configuration | responseAnalyzer, finalErrorAnalyzer |
| `params` | Custom params from hookParams | All hooks |
| `preExecutionResult` | Return value from preExecutionHook | responseAnalyzer, handleErrors, handleSuccessfulAttemptData, finalErrorAnalyzer |
| `commonBuffer` | Shared state buffer | All hooks |
| `executionContext` | Workflow/phase/request IDs | All hooks |
| `transactionLogs` | Historical transaction logs | All hooks |
| `inputParams` | preExecutionHookParams | preExecutionHook |
| `stableRequestOptions` | Full stableRequest config | preExecutionHook |

---

### 📊 Comprehensive Metrics

Get detailed metrics for every request:

```typescript
import { stableRequest, REQUEST_METHODS, RETRY_STRATEGIES } from 'stable-request';
import type { 
  STABLE_REQUEST_RESULT, 
  MetricsGuardrails,
  StableRequestMetrics
} from 'stable-request';

interface ApiResponse {
  data: string[];
}

(async () => {
  const metricsGuardrails: MetricsGuardrails = {
    request: {
      totalAttempts: { max: 5 },
      totalExecutionTime: { max: 10000 },
      failedAttempts: { max: 2 }
    }
  };

  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    retryStrategy: RETRY_STRATEGIES.EXPONENTIAL,
    logAllErrors: true,
    logAllSuccessfulAttempts: true,
    metricsGuardrails
  });

  const metrics: StableRequestMetrics | undefined = result.metrics;
  console.log(metrics);
  // {
  //   totalAttempts: 3,
  //   successfulAttempts: 1,
  //   failedAttempts: 2,
  //   totalExecutionTime: 4532,
  //   averageAttemptTime: 1510,
  //   infrastructureMetrics: {
  //     circuitBreaker: { state: 'CLOSED', failurePercentage: 10, ... },
  //     cache: { hitRate: 45.5, missRate: 54.5, ... }
  //   },
  //   validation: { isValid: true, anomalies: [] }
  // }
})();
```

### 🧪 Trial Mode (Chaos Engineering)

Test your error handling without hitting real endpoints:

```typescript
import { stableRequest, REQUEST_METHODS } from 'stable-request';
import type { STABLE_REQUEST_RESULT, TRIAL_MODE_OPTIONS } from 'stable-request';

interface ApiResponse {
  data: unknown;
}

(async () => {
  const trialMode: TRIAL_MODE_OPTIONS = {
    enabled: true,
    reqFailureProbability: 0.3,   // 30% chance of request failure
    retryFailureProbability: 0.2  // 20% chance retry is not allowed
  };

  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    trialMode
  });
})();
```

### 🎯 Execution Context

Track requests across distributed systems:

```typescript
import { stableRequest, REQUEST_METHODS } from 'stable-request';
import type { STABLE_REQUEST_RESULT, ExecutionContext } from 'stable-request';

interface ApiResponse {
  data: unknown;
}

(async () => {
  const executionContext: ExecutionContext = {
    workflowId: 'order-processing-123',
    phaseId: 'payment-validation',
    requestId: 'req-456'
  };

  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    executionContext
  });
  // Logs will include: [Workflow: order-processing-123] [Phase: payment-validation] [Request: req-456]
})();
```

## StableBuffer API

### Constructor Options

```typescript
import { StableBuffer } from 'stable-request';
import type { StableBufferOptions, StableBufferTransactionLog, MetricsGuardrailsStableBuffer, StableBufferState } from 'stable-request';

const bufferOptions: StableBufferOptions = {
  initialState: {},              // Starting state
  clone: (state: StableBufferState): StableBufferState => ({ ...state }),  // Custom cloning function
  transactionTimeoutMs: 5000,    // Transaction timeout
  logTransaction: async (log: StableBufferTransactionLog): Promise<void> => {}, // Transaction logger
  metricsGuardrails: {           // Validation rules
    totalTransactions: { max: 1000 },
    averageQueueWaitMs: { max: 100 }
  }
};

const buffer = new StableBuffer(bufferOptions);
```

### Methods

```typescript
import { StableBuffer } from 'stable-request';
import type { StableBufferMetrics, StableBufferState } from 'stable-request';

interface BufferState extends StableBufferState {
  value: string;
  counter: number;
  newState?: boolean;
}

const buffer = new StableBuffer({
  initialState: { value: '', counter: 0 } as BufferState
});

(async () => {
  // Read current state (cloned)
  const state = buffer.read() as BufferState;

  // Get direct state reference
  const directState = buffer.getState() as BufferState;

  // Set entire state
  buffer.setState({ value: '', counter: 0, newState: true } as BufferState);

  // Run transaction
  const result: string = await buffer.run(async (state): Promise<string> => {
    const typedState = state as BufferState;
    typedState.value = 'updated';
    return typedState.value;
  });

  // Update state (no return value)
  await buffer.run(async (state): Promise<void> => {
    const typedState = state as BufferState;
    typedState.counter += 1;
  });

  // Get metrics
  const metrics: StableBufferMetrics = buffer.getMetrics();
})();
```

### Transaction Logs

Each transaction generates a log entry:

```typescript
interface StableBufferTransactionLog {
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
  activity?: string;
  hookName?: string;
  hookParams?: any;
  workflowId?: string;
  branchId?: string;
  phaseId?: string;
  requestId?: string;
}
```

## Infrastructure Persistence

Persist circuit breaker and cache state for recovery:

```typescript
import { stableRequest, StableBuffer, REQUEST_METHODS } from 'stable-request';
import type { 
  STABLE_REQUEST_RESULT, 
  CircuitBreakerConfig, 
  CacheConfig,
  CircuitBreakerPersistedState,
  CacheManagerPersistedState,
  InfrastructurePersistence
} from 'stable-request';

interface ApiResponse {
  data: unknown;
}

(async () => {
  const sharedBuffer = new StableBuffer({
    initialState: {}
  });

  const circuitBreakerPersistence: InfrastructurePersistence<CircuitBreakerPersistedState> = {
    load: async (): Promise<CircuitBreakerPersistedState | null> => await loadCircuitBreakerState(),
    store: async (state: CircuitBreakerPersistedState): Promise<void> => await saveCircuitBreakerState(state),
    buffer: sharedBuffer  // Use StableBuffer for coordination
  };

  const circuitBreakerConfig: CircuitBreakerConfig = {
    failureThresholdPercentage: 50,
    minimumRequests: 10,
    recoveryTimeoutMs: 30000,
    persistence: circuitBreakerPersistence
  };

  const cachePersistence: InfrastructurePersistence<CacheManagerPersistedState> = {
    load: async (): Promise<CacheManagerPersistedState | null> => await loadCacheState(),
    store: async (state: CacheManagerPersistedState): Promise<void> => await saveCacheState(state)
  };

  const cacheConfig: CacheConfig = {
    enabled: true,
    persistence: cachePersistence
  };

  const result: STABLE_REQUEST_RESULT<ApiResponse> = await stableRequest<void, ApiResponse>({
    reqData: { 
      hostname: 'api.example.com', 
      path: '/data',
      method: REQUEST_METHODS.GET
    },
    resReq: true,
    circuitBreaker: circuitBreakerConfig,
    cache: cacheConfig
  });
})();
```

## Complete Example

```typescript
import { 
  stableRequest, 
  StableBuffer, 
  RETRY_STRATEGIES,
  REQUEST_METHODS 
} from 'stable-request';
import type {
  STABLE_REQUEST_RESULT,
  StableBufferTransactionLog,
  CircuitBreakerConfig,
  CacheConfig,
  MetricsGuardrails,
  ExecutionContext,
  ResponseAnalysisHookOptions,
  HandleErrorHookOptions,
  ERROR_LOG
} from 'stable-request';

// Define response and request types
interface UserRequest {
  name: string;
}

interface UserResponse {
  id: string;
  name: string;
  createdAt: string;
}

(async () => {
  // Create shared buffer for state management
  const buffer = new StableBuffer({
    initialState: { 
      requestCount: 0,
      errors: [] as ERROR_LOG[]
    },
    logTransaction: async (log: StableBufferTransactionLog): Promise<void> => {
      await persistTransactionLog(log);
    }
  });

  // Define typed configurations
  const circuitBreakerConfig: CircuitBreakerConfig = {
    failureThresholdPercentage: 50,
    minimumRequests: 5,
    recoveryTimeoutMs: 30000
  };

  const cacheConfig: CacheConfig = {
    enabled: true,
    ttl: 60000
  };

  const executionContext: ExecutionContext = {
    workflowId: 'user-creation',
    requestId: 'create-user-001'
  };

  const metricsGuardrails: MetricsGuardrails = {
    request: {
      totalExecutionTime: { max: 15000 },
      failedAttempts: { max: 2 }
    }
  };

  // Make a resilient request
  const result: STABLE_REQUEST_RESULT<UserResponse> = await stableRequest<UserRequest, UserResponse>({
    reqData: {
      hostname: 'api.example.com',
      path: '/users',
      method: REQUEST_METHODS.POST,
      body: { name: 'John Doe' },
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    },
    resReq: true,
    attempts: 3,
    wait: 1000,
    retryStrategy: RETRY_STRATEGIES.EXPONENTIAL,
    jitter: 0.2,
    
    commonBuffer: buffer,
    
    circuitBreaker: circuitBreakerConfig,
    cache: cacheConfig,
    
    responseAnalyzer: async (options: ResponseAnalysisHookOptions<UserRequest, UserResponse>): Promise<boolean> => {
      const { data, commonBuffer } = options;
      if (commonBuffer) commonBuffer.requestCount += 1;
      return data.id !== undefined;
    },
    
    logAllErrors: true,
    handleErrors: async (options: HandleErrorHookOptions<UserRequest>): Promise<void> => {
      const { errorLog, commonBuffer } = options;
      if (commonBuffer) commonBuffer.errors.push(errorLog);
    },
    
    executionContext,
    metricsGuardrails
  });

  if (result.success) {
    console.log('User created:', result.data);
  } else {
    console.error('Failed:', result.error);
  }

  console.log('Metrics:', result.metrics);
  console.log('Buffer state:', buffer.read());
})();
```

## TypeScript Support

This library is written in TypeScript and includes full type definitions:

```typescript
import type {
  STABLE_REQUEST,
  STABLE_REQUEST_RESULT,
  StableBufferOptions,
  StableBufferTransactionLog,
  CircuitBreakerConfig,
  CacheConfig,
  MetricsGuardrails
} from 'stable-request';
```

## Migration to stable-infra

If you need workflows, schedulers, or advanced orchestration, migrating to stable-infra is straightforward:

```typescript
// stable-request
import { stableRequest } from 'stable-request';

// stable-infra (same API, more features)
import { stableRequest } from 'stable-infra';

// Plus you get access to:
import { 
  stableWorkflow,
  stableApiGateway,
  stableFunction,
  stableScheduler,
  stableWorkflowGraph
} from 'stable-infra';
```

## License

MIT

---

**stable-request** is now in maintenance mode. For new projects, please use [**stable-infra**](https://npmjs.com/package/@emmvish/stable-infra).
