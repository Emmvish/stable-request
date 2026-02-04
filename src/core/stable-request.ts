import { AxiosRequestConfig } from 'axios';

import {
  RETRY_STRATEGIES,
  RESPONSE_ERRORS,
  CircuitBreakerState
} from '../enums/index.js';

import { 
  ERROR_LOG,
  PreExecutionHookOptions,
  ReqFnResponse, 
  STABLE_REQUEST,
  STABLE_REQUEST_RESULT,
  SUCCESSFUL_ATTEMPT_DATA,
  StableBufferTransactionLog,
} from '../types/index.js';

import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  executeWithPersistence,
  formatLogContext,
  generateAxiosRequestConfig,
  getNewDelayTime,
  getGlobalCacheManager,
  delay,
  reqFn,
  safelyStringify,
  validateTrialModeProbabilities,
  MetricsAggregator,
  MetricsValidator
} from '../utilities/index.js';

export async function stableRequest<RequestDataType = any, ResponseDataType = any>(
  options: STABLE_REQUEST<RequestDataType, ResponseDataType>
): Promise<STABLE_REQUEST_RESULT<ResponseDataType>> {
  const { 
    preExecution = {
      preExecutionHook: ({ inputParams, commonBuffer }: PreExecutionHookOptions) => {},
      preExecutionHookParams: {},
      applyPreExecutionConfigOverride: false,
      continueOnPreExecutionHookFailure: false,
    },
    commonBuffer = {},
    executionContext,
    throwOnFailedErrorAnalysis = false,
    loadTransactionLogs,
    transactionLogs: preloadedTransactionLogs
  } = options;

  let transactionLogs: StableBufferTransactionLog[] | undefined = preloadedTransactionLogs;
  if (loadTransactionLogs) {
    try {
      transactionLogs = await loadTransactionLogs(executionContext || {});
    } catch (e: any) {
      console.error(`stable-request: Failed to load transaction logs: ${e.message}`);
    }
  }

  let preExecutionResult: Partial<STABLE_REQUEST<RequestDataType, ResponseDataType>> | unknown;
  try {
    preExecutionResult = await executeWithPersistence<Partial<STABLE_REQUEST<RequestDataType, ResponseDataType>> | unknown>(
      preExecution?.preExecutionHook as Function,
      {
        inputParams: preExecution?.preExecutionHookParams,
        commonBuffer,
        stableRequestOptions: options,
        transactionLogs
      },
      options.statePersistence,
      executionContext || {},
      commonBuffer
    );
    if(preExecution?.applyPreExecutionConfigOverride) {
      const finalOptions = {
        ...options,
        ...preExecutionResult as Partial<STABLE_REQUEST<RequestDataType, ResponseDataType>>
      }
      Object.assign(options, finalOptions);
    }
  } catch(e: any) {
    if (!preExecution?.continueOnPreExecutionHookFailure) {
      if (throwOnFailedErrorAnalysis) {
        throw e;
      }
      return {
        success: false,
        error: e.message || 'Pre-execution hook failed',
        metrics: {
          totalAttempts: 0,
          successfulAttempts: 0,
          failedAttempts: 0,
          totalExecutionTime: 0,
          averageAttemptTime: 0
        }
      };
    }
  }
  const {
    reqData: givenReqData,
    responseAnalyzer = ({ reqData, data, trialMode = { enabled: false } }) => true,
    resReq = false,
    attempts: givenAttempts = 1,
    performAllAttempts = false,
    wait = 1000,
    maxAllowedWait = 60000,
    retryStrategy = RETRY_STRATEGIES.FIXED,
    logAllErrors = false,
    handleErrors = ({ reqData, errorLog, maxSerializableChars = 1000, executionContext }) => 
      console.error(
        `${formatLogContext(executionContext)}stable-request:\n`,
        'Request data:\n',
        safelyStringify(reqData, maxSerializableChars),
        '\nError log:\n',
        safelyStringify(errorLog, maxSerializableChars)
      ),
    logAllSuccessfulAttempts = false,
    handleSuccessfulAttemptData = ({ reqData, successfulAttemptData, maxSerializableChars = 1000, executionContext }) =>
      console.info(
        `${formatLogContext(executionContext)}stable-request:\n`,
        'Request data:\n',
        safelyStringify(reqData, maxSerializableChars),
        '\nSuccessful attempt:\n',
        safelyStringify(successfulAttemptData, maxSerializableChars)
      ),
    maxSerializableChars = 1000,
    finalErrorAnalyzer = ({ reqData, error, trialMode = { enabled: false } }) => false,
    trialMode = { enabled: false },
    hookParams = {},
    cache,
    circuitBreaker,
    jitter = 0,
    statePersistence
  } = options;
  let attempts = givenAttempts;
  const reqData: AxiosRequestConfig<RequestDataType> = generateAxiosRequestConfig<RequestDataType>(givenReqData);
  
  const requestStartTime = Date.now();
  const errorLogs: ERROR_LOG[] = [];
  const successfulAttemptsList: SUCCESSFUL_ATTEMPT_DATA<ResponseDataType>[] = [];
  let totalAttemptsMade = 0;
  let successfulAttemptsCount = 0;
  
  const buildResult = (success: boolean, data?: ResponseDataType | boolean, error?: string): STABLE_REQUEST_RESULT<ResponseDataType> => {
    const totalExecutionTime = Date.now() - requestStartTime;
    const failedAttemptsCount = totalAttemptsMade - successfulAttemptsCount;
    
    const result: STABLE_REQUEST_RESULT<ResponseDataType> = {
      success,
      ...(data !== undefined && { data }),
      ...(error && { error }),
      ...(errorLogs.length > 0 && { errorLogs }),
      ...(successfulAttemptsList.length > 0 && { successfulAttempts: successfulAttemptsList }),
      metrics: {
        totalAttempts: totalAttemptsMade,
        successfulAttempts: successfulAttemptsCount,
        failedAttempts: failedAttemptsCount,
        totalExecutionTime,
        averageAttemptTime: totalAttemptsMade > 0 ? totalExecutionTime / totalAttemptsMade : 0,
        infrastructureMetrics: {
          ...(circuitBreakerInstance && { circuitBreaker: MetricsAggregator.extractCircuitBreakerMetrics(circuitBreakerInstance) }),
          ...(cache && getGlobalCacheManager() && { cache: MetricsAggregator.extractCacheMetrics(getGlobalCacheManager()) })
        }
      }
    };
    
    if (options.metricsGuardrails && result.metrics) {
      result.metrics.validation = MetricsValidator.validateRequestMetrics(
        result.metrics,
        options.metricsGuardrails
      );
    }
    
    return result;
  };
  
  let circuitBreakerInstance: CircuitBreaker | null = null;
  if (circuitBreaker) {
    circuitBreakerInstance = circuitBreaker instanceof CircuitBreaker
      ? circuitBreaker
      : new CircuitBreaker(circuitBreaker);
  }
  try {
    validateTrialModeProbabilities(trialMode);
    let res: ReqFnResponse = {
      ok: false,
      isRetryable: true,
      timestamp: new Date().toISOString(),
      executionTime: 0,
      statusCode: 0
    };
    const maxAttempts = attempts;
    let lastSuccessfulAttemptData: ResponseDataType | undefined = undefined;
    let hadAtLeastOneSuccess = false;
    do {
      attempts--;
      const currentAttempt = maxAttempts - attempts;
      totalAttemptsMade = currentAttempt;
      if (circuitBreakerInstance) {
        const cbConfig = circuitBreakerInstance.getState().config;
        if (cbConfig.trackIndividualAttempts || currentAttempt === 1) {
          const canExecute = await circuitBreakerInstance.canExecute();
          if (!canExecute) {
            throw new CircuitBreakerOpenError(
              `${formatLogContext(executionContext)}stable-request: Circuit breaker is ${circuitBreakerInstance.getState().state}. Request blocked at attempt ${currentAttempt}.`
            );
          }
        }
      }
      try {
        res = await reqFn<RequestDataType, ResponseDataType>(reqData, resReq, maxSerializableChars, trialMode, cache, executionContext);
        if (res.fromCache && res.ok) {
          if (trialMode.enabled) {
            console.info(
              `${formatLogContext(executionContext)}stable-request: Response served from cache:\n`,
              safelyStringify(res?.data, maxSerializableChars)
            );
          }
          return buildResult(true, resReq ? res?.data! : true);
        }
        
      } catch(attemptError: any) {
        if (attemptError instanceof CircuitBreakerOpenError) {
          throw attemptError;
        }
        if (circuitBreakerInstance && circuitBreakerInstance.getState().config.trackIndividualAttempts) {
          circuitBreakerInstance.recordAttemptFailure();
          if (circuitBreakerInstance.getState().state === CircuitBreakerState.OPEN) {
            throw new CircuitBreakerOpenError(
              `${formatLogContext(executionContext)}stable-request: Circuit breaker opened after attempt ${currentAttempt}. No further retries.`
            );
          }
        }
        throw attemptError;
      }
      const originalResOk = res.ok;
      let performNextAttempt: boolean = false;
      if (res.ok) {
        try {
          performNextAttempt = !(await executeWithPersistence<boolean>(
            responseAnalyzer,
            {
              reqData,
              data: res?.data,
              trialMode,
              params: hookParams?.responseAnalyzerParams,
              preExecutionResult,
              commonBuffer,
              executionContext,
              transactionLogs
            },
            statePersistence,
            executionContext || {},
            commonBuffer
          ));
        } catch (e: any) {
          console.error(
            `${formatLogContext(executionContext)}stable-request: Unable to analyze the response returned on attempt #${currentAttempt}. Response: ${safelyStringify(
              res?.data,
              maxSerializableChars
            )}`
          );
          console.error(
            `${formatLogContext(executionContext)}stable-request: Error message provided by your responseAnalyzer: ${safelyStringify(
              e.message,
              maxSerializableChars
            )}`
          );
          performNextAttempt = true;
        }
      }
      
      if (circuitBreakerInstance && circuitBreakerInstance.getState().config.trackIndividualAttempts) {
        if (res.ok && !performNextAttempt) {
          circuitBreakerInstance.recordAttemptSuccess();
        } else if (!res.ok || performNextAttempt) {
          circuitBreakerInstance.recordAttemptFailure();
          if (circuitBreakerInstance.getState().state === CircuitBreakerState.OPEN) {
            throw new CircuitBreakerOpenError(
              `${formatLogContext(executionContext)}stable-request: Circuit breaker opened after attempt ${currentAttempt}/${maxAttempts}. Blocking further retries.`
            );
          }
        }
      }
      
      if ((!res.ok || (res.ok && performNextAttempt)) && logAllErrors) {
        const errorLog: ERROR_LOG = {
          timestamp: res.timestamp,
          attempt: `${currentAttempt}/${maxAttempts}`,
          error:
            res?.error ??
            `${formatLogContext(executionContext)}stable-request: The response did not match your expectations! Response: ${safelyStringify(
              res?.data,
              maxSerializableChars
            )}`,
          type: !res.ok
            ? RESPONSE_ERRORS.HTTP_ERROR
            : RESPONSE_ERRORS.INVALID_CONTENT,
          isRetryable: res.isRetryable,
          executionTime: res.executionTime,
          statusCode: res.statusCode
        };
        errorLogs.push(errorLog);
        try {
          await executeWithPersistence<void>(
            handleErrors,
            {
              reqData,
              errorLog,
              maxSerializableChars,
              params: hookParams?.handleErrorsParams,
              preExecutionResult,
              commonBuffer,
              executionContext,
              transactionLogs
            },
            statePersistence,
            executionContext || {},
            commonBuffer
          );
        } catch (e: any) {
          console.error(
            `${formatLogContext(executionContext)}stable-request: Unable to report errors due to issues with error handler! Error message provided by your handleErrors: ${safelyStringify(
              e.message,
              maxSerializableChars
            )}`
          );
        }
      }
      if (res.ok && !performNextAttempt) {
        hadAtLeastOneSuccess = true;
        lastSuccessfulAttemptData = res?.data;
        successfulAttemptsCount++;
        if (logAllSuccessfulAttempts) {
          const successfulAttemptLog: SUCCESSFUL_ATTEMPT_DATA<ResponseDataType> = {
            attempt: `${currentAttempt}/${maxAttempts}`,
            timestamp: res.timestamp,
            data: res?.data,
            executionTime: res.executionTime,
            statusCode: res.statusCode
          };
          successfulAttemptsList.push(successfulAttemptLog);
          try {
            await executeWithPersistence<void>(
              handleSuccessfulAttemptData,
              {
                reqData,
                successfulAttemptData: successfulAttemptLog,
                maxSerializableChars,
                params: hookParams?.handleSuccessfulAttemptDataParams,
                preExecutionResult,
                commonBuffer,
                executionContext,
                transactionLogs
              },
              statePersistence,
              executionContext || {},
              commonBuffer
            );
          } catch (e: any) {
            console.error(
              `${formatLogContext(executionContext)}stable-request: Unable to report successful attempts due to issues with successful attempt data handler! Error message provided by your handleSuccessfulAttemptData: ${safelyStringify(
                e.message,
                maxSerializableChars
              )}`
            );
          }
        }
      }
      if (performNextAttempt && res.isRetryable) {
        res.ok = false;
      }
      if (
        attempts > 0 &&
        ((!originalResOk && res.isRetryable) ||
          (originalResOk && performNextAttempt) ||
          performAllAttempts)
      ) {
        await delay(getNewDelayTime(retryStrategy, wait, currentAttempt, jitter), maxAllowedWait);
      }
    } while (
      attempts > 0 &&
      ((res.isRetryable && !res.ok) || performAllAttempts)
    );
    
    if (performAllAttempts && hadAtLeastOneSuccess) {
      if (trialMode.enabled) {
        console.info(
          `${formatLogContext(executionContext)}stable-request: Final response (performAllAttempts mode):\n`,
          safelyStringify(lastSuccessfulAttemptData as Record<string, any>, maxSerializableChars)
        );
      }
      return buildResult(true, resReq ? lastSuccessfulAttemptData! : true);
    } else if (res.ok) {
      if (trialMode.enabled) {
        const finalResponse = res?.data ?? lastSuccessfulAttemptData;
        console.info(
          `${formatLogContext(executionContext)}stable-request: Final response:\n`,
          safelyStringify(finalResponse, maxSerializableChars)
        );
      }
      return buildResult(true, resReq ? (res?.data ?? lastSuccessfulAttemptData!) : true);
    } else {
      const finalError = new Error(
        safelyStringify(
          {
            error: res?.error,
            'Request Data': reqData,
          },
          maxSerializableChars
        )
      );
      
      let errorAnalysisResult = false;
      try {
        errorAnalysisResult = await executeWithPersistence<boolean>(
          finalErrorAnalyzer,
          {
            reqData,
            error: finalError,
            trialMode,
            params: hookParams?.finalErrorAnalyzerParams,
            preExecutionResult,
            commonBuffer,
            executionContext,
            transactionLogs
          },
          statePersistence,
          executionContext || {},
          commonBuffer
        );
      } catch(errorAnalysisError: any) {
        console.error(
          `${formatLogContext(executionContext)}stable-request: Unable to analyze the final error returned. Error message provided by your finalErrorAnalyzer: ${safelyStringify(
            errorAnalysisError.message,
            maxSerializableChars
          )}`
        );
      }

      if (throwOnFailedErrorAnalysis && !errorAnalysisResult) {
        throw finalError;
      }
      return buildResult(false, undefined, res?.error || 'Request failed');
    }
  } catch (e: any) {
    if (trialMode.enabled) {
      console.error(`${formatLogContext(executionContext)}stable-request: Final error:\n`, e.message);
    }
    let errorAnalysisResult = false;
    try {
      errorAnalysisResult = await executeWithPersistence<boolean>(
        finalErrorAnalyzer,
        {
          reqData,
          error: e,
          trialMode,
          params: hookParams?.finalErrorAnalyzerParams,
          preExecutionResult,
          commonBuffer,
          executionContext,
          transactionLogs
        },
        statePersistence,
        executionContext || {},
        commonBuffer
      );
    } catch(errorAnalysisError: any) {
      console.error(
        `${formatLogContext(executionContext)}stable-request: Unable to analyze the final error returned. Error message provided by your finalErrorAnalyzer: ${safelyStringify(
          errorAnalysisError.message,
          maxSerializableChars
        )}`
      );
    }
    if(!errorAnalysisResult) {
      if (throwOnFailedErrorAnalysis) {
        throw e;
      }
      return buildResult(false, undefined, e.message || 'Request failed');
    } else {
      return buildResult(false, undefined, e.message || 'Request failed');
    }
  }
}
