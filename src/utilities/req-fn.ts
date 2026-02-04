import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { ReqFnResponse, TRIAL_MODE_OPTIONS, CacheConfig, ExecutionContext } from '../types/index.js';
import { safelyStringify } from './safely-stringify.js';
import { isRetryableError } from './is-retryable-error.js';
import { CacheManager, getGlobalCacheManager } from './cache-manager.js';
import { formatLogContext } from './format-log-context.js';

export async function reqFn<RequestDataType = any, ResponseDataType = any>(
  reqData: AxiosRequestConfig<RequestDataType>,
  resReq = false,
  maxSerializableChars = 1000,
  trialMode: TRIAL_MODE_OPTIONS = { enabled: false },
  cacheConfig?: CacheConfig,
  executionContext?: ExecutionContext
): Promise<ReqFnResponse<ResponseDataType>> {
  const startTime = Date.now();
  let stopTime = 0;
  const timestamp = new Date(startTime).toISOString();

  let cacheManager: CacheManager | null = null;
  if (cacheConfig?.enabled) {
    cacheManager = getGlobalCacheManager(cacheConfig);
    
    const cached = cacheManager.get<ResponseDataType>(reqData);
    if (cached) {
      return {
        ok: true,
        isRetryable: true,
        data: resReq ? cached.data : undefined,
        timestamp: new Date(cached.timestamp).toISOString(),
        executionTime: 0,
        statusCode: cached.status,
        fromCache: true
      };
    }
  }

  try {
    if (trialMode.enabled) {
      const trialCondition =
        Math.random() <= (trialMode?.reqFailureProbability ?? 0);
      if (trialCondition) {
        console.error(
          `${formatLogContext(executionContext)}stable-request: Request failed in trial mode.\nRequest data:\n`,
          safelyStringify(reqData, maxSerializableChars)
        );
        throw new Error('stable-request: Request failed in trial mode.');
      } else {
        stopTime = Date.now();
        return {
          ok: true,
          isRetryable: true,
          timestamp,
          executionTime: stopTime - startTime,
          statusCode: 200,
          ...(resReq && { data: { trialMode } as ResponseDataType }),
          fromCache: false
        };
      }
    }

    const res = await axios.request<ResponseDataType>(reqData);
    stopTime = Date.now();

    if (cacheManager) {
      cacheManager.set(
        reqData,
        res.data,
        res.status,
        res.statusText,
        res.headers as Record<string, any>
      );
    }

    return resReq
      ? {
          ok: true,
          isRetryable: true,
          data: res?.data,
          timestamp,
          executionTime: stopTime - startTime,
          statusCode: res?.status || 200,
          fromCache: false
        }
      : { 
          ok: true, 
          isRetryable: true, 
          timestamp,
          executionTime: stopTime - startTime,
          statusCode: res?.status || 200,
          fromCache: false
        };
  } catch (e: any) {
    stopTime = Date.now();
    if(axios.isCancel(e)) {
      return {
        ok: false,
        error: 'stable-request: Request was cancelled.',
        isRetryable: false,
        timestamp,
        executionTime: stopTime - startTime,
        statusCode: (e as AxiosError)?.response?.status || 0,
        fromCache: false
      };
    }
    return {
      ok: false,
      error: `stable-request: ${(e as AxiosError)?.response?.data ?? e?.message}`,
      isRetryable: isRetryableError(e as AxiosError, trialMode),
      timestamp,
      executionTime: stopTime - startTime,
      statusCode: (e as AxiosError)?.response?.status || 0,
      fromCache: false
    };
  }
}
