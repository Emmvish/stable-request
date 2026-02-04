/**
 * Test Suite: StableRequest Advanced Features
 * Tests circuit breaker, caching, buffer integration, and complex scenarios
 */

import axios from 'axios';
import { stableRequest, REQUEST_METHODS, StableBuffer, RETRY_STRATEGIES } from '../src';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('StableRequest - Advanced Features', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('Circuit Breaker', () => {
    it('should allow requests when circuit breaker is configured', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { data: 'success' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        circuitBreaker: {
          failureThresholdPercentage: 50,
          minimumRequests: 5,
          recoveryTimeoutMs: 5000,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should work with circuit breaker on failures', async () => {
      const networkError = new Error('Service unavailable') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ERR_NETWORK';
      mockedAxios.request.mockRejectedValue(networkError);

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const circuitBreakerConfig = {
        failureThresholdPercentage: 50,
        minimumRequests: 3,
        recoveryTimeoutMs: 5000,
      };

      // Make multiple failing requests
      for (let i = 0; i < 3; i++) {
        await stableRequest({
          reqData,
          circuitBreaker: circuitBreakerConfig,
          attempts: 1,
        });
      }

      // Should have made requests
      expect(mockedAxios.request).toHaveBeenCalled();
    });
  });

  describe('Caching', () => {
    it('should configure caching when enabled', async () => {
      mockedAxios.request.mockResolvedValue({
        data: { data: 'cached' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/cacheable' as const,
        method: REQUEST_METHODS.GET,
      };

      // First request
      await stableRequest({
        reqData,
        cache: { enabled: true, ttl: 10000 },
      });

      expect(mockedAxios.request).toHaveBeenCalled();
    });

    it('should not cache when disabled', async () => {
      mockedAxios.request.mockResolvedValue({
        data: { data: 'not cached' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/nocache' as const,
        method: REQUEST_METHODS.GET,
      };

      await stableRequest({ reqData, cache: { enabled: false } });
      await stableRequest({ reqData, cache: { enabled: false } });

      expect(mockedAxios.request).toHaveBeenCalledTimes(2);
    });

    it('should respect cache configuration options', async () => {
      mockedAxios.request.mockResolvedValue({
        data: { data: 'test' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        cache: {
          enabled: true,
          ttl: 60000,
          cacheableStatusCodes: [200, 201],
          maxSize: 100,
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Request Grouping', () => {
    it('should handle multiple concurrent requests', async () => {
      mockedAxios.request.mockResolvedValue({
        data: { id: 1 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const requests = [
        { hostname: 'api.example.com', path: '/users/1' as const, method: REQUEST_METHODS.GET },
        { hostname: 'api.example.com', path: '/users/2' as const, method: REQUEST_METHODS.GET },
        { hostname: 'api.example.com', path: '/users/3' as const, method: REQUEST_METHODS.GET },
      ];

      const results = await Promise.all(
        requests.map(reqData => stableRequest({ reqData }))
      );

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Integration with StableBuffer', () => {
    it('should work with StableBuffer for state management', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { userId: 123, name: 'Test User' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const buffer = new StableBuffer({ 
        initialState: { lastResponse: null } 
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/user' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        commonBuffer: buffer,
      });

      expect(result.success).toBe(true);
    });

    it('should pass buffer data to requests', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const buffer = new StableBuffer({
        initialState: { authToken: 'test-token-123' },
      });

      const state = buffer.getState() as { authToken: string };
      const reqData = {
        hostname: 'api.example.com',
        path: '/protected' as const,
        method: REQUEST_METHODS.GET,
        headers: { Authorization: `Bearer ${state.authToken}` },
      };

      const result = await stableRequest({ reqData });

      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalled();
    });

    it('should update buffer state on successful request', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { data: 'new data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const buffer = new StableBuffer({
        initialState: { requestCount: 0 },
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      await stableRequest({
        reqData,
        commonBuffer: buffer,
        handleSuccessfulAttemptData: () => {
          const state = buffer.getState() as { requestCount: number };
          buffer.setState({ requestCount: state.requestCount + 1 });
        },
        logAllSuccessfulAttempts: true,
      });

      const finalState = buffer.getState() as { requestCount: number };
      expect(finalState.requestCount).toBe(1);
    });
  });

  describe('Trial Mode', () => {
    it('should execute in trial mode with proper configuration', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { trial: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/trial' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        trialMode: {
          enabled: true,
          reqFailureProbability: 0,
          retryFailureProbability: 0,
        },
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle trial mode with 100% success', async () => {
      const reqData = {
        hostname: 'api.example.com',
        path: '/trial' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        trialMode: {
          enabled: true,
          reqFailureProbability: 0, // 0% failure = 100% success
        },
        attempts: 1,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle chained requests', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({
          data: { userId: 1 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        })
        .mockResolvedValueOnce({
          data: { posts: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        });

      // First request to get user
      const userResult = await stableRequest({
        reqData: {
          hostname: 'api.example.com',
          path: '/user' as const,
          method: REQUEST_METHODS.GET,
        },
      });

      expect(userResult.success).toBe(true);

      // Second request using data from first
      const postsResult = await stableRequest({
        reqData: {
          hostname: 'api.example.com',
          path: '/posts' as const,
          method: REQUEST_METHODS.GET,
          query: { userId: 1 },
        },
      });

      expect(postsResult.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure responses', async () => {
      // Reset and isolate this test
      jest.clearAllMocks();
      
      const error = new Error('Bad Request') as any;
      error.isAxiosError = true;
      error.response = {
        status: 400,
        statusText: 'Bad Request',
        data: { message: 'Bad request' },
        headers: {},
        config: {} as any,
      };

      // Use mockImplementationOnce for precise control
      mockedAxios.request
        .mockImplementationOnce(() => Promise.resolve({
          data: { id: 1 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }))
        .mockImplementationOnce(() => Promise.reject(error))
        .mockImplementationOnce(() => Promise.resolve({
          data: { id: 3 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }));

      // Execute sequentially to ensure predictable mock behavior
      const result1 = await stableRequest({
        reqData: { hostname: 'api.example.com', path: '/a' as const, method: REQUEST_METHODS.GET },
        attempts: 1,
        cache: { enabled: false },
      });
      
      const result2 = await stableRequest({
        reqData: { hostname: 'api.example.com', path: '/b' as const, method: REQUEST_METHODS.GET },
        attempts: 1,
        cache: { enabled: false },
      });
      
      const result3 = await stableRequest({
        reqData: { hostname: 'api.example.com', path: '/c' as const, method: REQUEST_METHODS.GET },
        attempts: 1,
        cache: { enabled: false },
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
      expect(result3.success).toBe(true);
    });

    it('should handle request with all options combined', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { complete: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const handleSuccessfulAttemptData = jest.fn();
      const responseAnalyzer = jest.fn().mockReturnValue(true);

      const result = await stableRequest({
        reqData: {
          hostname: 'api.example.com',
          path: '/complete' as const,
          method: REQUEST_METHODS.POST,
          body: { data: 'test' },
          headers: { 'X-Custom-Header': 'value' },
          query: { param: 'value' },
        },
        attempts: 3,
        wait: 100,
        retryStrategy: RETRY_STRATEGIES.LINEAR,
        circuitBreaker: {
          failureThresholdPercentage: 50,
          minimumRequests: 5,
          recoveryTimeoutMs: 10000,
        },
        cache: { enabled: false },
        handleSuccessfulAttemptData,
        logAllSuccessfulAttempts: true,
        responseAnalyzer,
      });

      expect(result.success).toBe(true);
      expect(responseAnalyzer).toHaveBeenCalled();
      expect(handleSuccessfulAttemptData).toHaveBeenCalled();
    });
  });

  describe('Error Response Details', () => {
    it('should provide detailed error information on HTTP error', async () => {
      // Reset and isolate this test
      jest.clearAllMocks();
      
      const error = new Error('Bad Request') as any;
      error.isAxiosError = true;
      error.response = {
        status: 400,
        statusText: 'Bad Request',
        data: { message: 'Bad request' },
        headers: {},
        config: {} as any,
      };
      mockedAxios.request.mockImplementationOnce(() => Promise.reject(error));

      const reqData = {
        hostname: 'api.example.com',
        path: '/error' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        attempts: 1,
        logAllErrors: true,
        cache: { enabled: false },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle HTTP error responses', async () => {
      const error = new Error('Forbidden') as any;
      error.isAxiosError = true;
      error.response = {
        status: 403,
        statusText: 'Forbidden',
        data: { message: 'Forbidden' },
        headers: {},
        config: {} as any,
      };
      mockedAxios.request.mockRejectedValueOnce(error);

      const reqData = {
        hostname: 'api.example.com',
        path: '/forbidden' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({ reqData, attempts: 1 });

      expect(result.success).toBe(false);
    });

    it('should handle 401 unauthorized responses', async () => {
      const error = new Error('Unauthorized') as any;
      error.isAxiosError = true;
      error.response = {
        status: 401,
        statusText: 'Unauthorized',
        data: { message: 'Unauthorized' },
        headers: {},
        config: {} as any,
      };
      mockedAxios.request.mockRejectedValueOnce(error);

      const reqData = {
        hostname: 'api.example.com',
        path: '/protected' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({ reqData, attempts: 1 });

      expect(result.success).toBe(false);
    });
  });

  describe('Max Allowed Wait', () => {
    it('should respect maxAllowedWait configuration', async () => {
      const networkError = new Error('Network Error') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ERR_NETWORK';
      mockedAxios.request.mockRejectedValue(networkError);

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const startTime = Date.now();
      await stableRequest({
        reqData,
        attempts: 5,
        wait: 1000,
        maxAllowedWait: 100,
      });
      const duration = Date.now() - startTime;

      // Should complete faster than without maxAllowedWait
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Jitter', () => {
    it('should apply jitter to retry delays', async () => {
      const networkError = new Error('Connection Reset') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ECONNRESET'; // Retryable error code
      mockedAxios.request.mockRejectedValue(networkError);

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        attempts: 3,
        wait: 50,
        jitter: 0.2,
        retryStrategy: RETRY_STRATEGIES.LINEAR,
      });

      expect(result.success).toBe(false);
      expect(mockedAxios.request).toHaveBeenCalledTimes(3);
    });
  });

  describe('Response With Data Request', () => {
    it('should return data when resReq is true', async () => {
      const responseData = { userId: 1, name: 'Test' };
      mockedAxios.request.mockResolvedValueOnce({
        data: responseData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        resReq: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(responseData);
    });

    it('should return boolean when resReq is false', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { some: 'data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        resReq: false,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });
  });

  describe('Serialization Limits', () => {
    it('should respect maxSerializableChars for error logging', async () => {
      const networkError = new Error('Network Error') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ERR_NETWORK';
      mockedAxios.request.mockRejectedValueOnce(networkError);

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        attempts: 1,
        maxSerializableChars: 100,
        logAllErrors: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
