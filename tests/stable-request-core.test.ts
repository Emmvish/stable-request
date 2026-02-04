/**
 * Test Suite: StableRequest Core Functionality
 * Tests basic operations, HTTP methods, error handling, retries, and hooks
 */

import axios from 'axios';
import { stableRequest, REQUEST_METHODS, VALID_REQUEST_PROTOCOLS, RETRY_STRATEGIES } from '../src';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('StableRequest - Core Functionality', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('Basic Request Execution', () => {
    it('should execute a simple GET request successfully', async () => {
      mockedAxios.request.mockResolvedValueOnce({
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

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalled();
    });

    it('should execute a POST request with body', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { id: 1 },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/users' as const,
        method: REQUEST_METHODS.POST,
        body: { name: 'John', email: 'john@example.com' },
      };

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
    });

    it('should handle query parameters correctly', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: [],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/search' as const,
        method: REQUEST_METHODS.GET,
        query: { q: 'test', page: 1 },
      };

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { q: 'test', page: 1 },
        })
      );
    });

    it('should handle custom headers', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/protected' as const,
        method: REQUEST_METHODS.GET,
        headers: { Authorization: 'Bearer token123' },
      };

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        })
      );
    });

    it('should use HTTPS protocol by default', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: {},
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

      await stableRequest({ reqData });
      
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('https://'),
        })
      );
    });

    it('should use HTTP protocol when specified', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
        protocol: VALID_REQUEST_PROTOCOLS.HTTP,
      };

      await stableRequest({ reqData });
      
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('http://'),
        })
      );
    });
  });

  describe('HTTP Methods', () => {
    it('should handle PUT requests', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { updated: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/users/1' as const,
        method: REQUEST_METHODS.PUT,
        body: { name: 'Updated Name' },
      };

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('should handle PATCH requests', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { patched: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/users/1' as const,
        method: REQUEST_METHODS.PATCH,
        body: { status: 'active' },
      };

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });

    it('should handle DELETE requests', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: {},
        status: 204,
        statusText: 'No Content',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/users/1' as const,
        method: REQUEST_METHODS.DELETE,
      };

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      (networkError as any).isAxiosError = true;
      (networkError as any).code = 'ERR_NETWORK';
      mockedAxios.request.mockRejectedValueOnce(networkError);

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({ reqData, attempts: 1 });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle 404 responses', async () => {
      const error = new Error('Not Found') as any;
      error.isAxiosError = true;
      error.response = {
        status: 404,
        statusText: 'Not Found',
        data: { message: 'Not found' },
        headers: {},
        config: {} as any,
      };
      mockedAxios.request.mockRejectedValueOnce(error);

      const reqData = {
        hostname: 'api.example.com',
        path: '/notfound' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({ reqData, attempts: 1 });
      
      expect(result.success).toBe(false);
    });

    it('should handle 500 server errors', async () => {
      const error = new Error('Internal Server Error') as any;
      error.isAxiosError = true;
      error.response = {
        status: 500,
        statusText: 'Internal Server Error',
        data: { message: 'Server error' },
        headers: {},
        config: {} as any,
      };
      mockedAxios.request.mockRejectedValueOnce(error);

      const reqData = {
        hostname: 'api.example.com',
        path: '/error' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({ reqData, attempts: 1 });
      
      expect(result.success).toBe(false);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Timeout') as any;
      timeoutError.isAxiosError = true;
      timeoutError.code = 'ECONNABORTED';
      mockedAxios.request.mockRejectedValueOnce(timeoutError);

      const reqData = {
        hostname: 'api.example.com',
        path: '/slow' as const,
        method: REQUEST_METHODS.GET,
        timeout: 50,
      };

      const result = await stableRequest({ reqData, attempts: 1 });
      
      expect(result.success).toBe(false);
    });
  });

  describe('Retry Mechanism', () => {
    it('should retry on failure and eventually succeed', async () => {
      const networkError = new Error('Connection Reset') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ECONNRESET'; // Retryable error code

      mockedAxios.request
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
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
        attempts: 3,
        wait: 10,
      });
      
      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting retries', async () => {
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
        wait: 10,
      });
      
      expect(result.success).toBe(false);
      expect(mockedAxios.request).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff strategy', async () => {
      const networkError = new Error('Connection Reset') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ECONNRESET'; // Retryable error code

      const callTimes: number[] = [];
      mockedAxios.request.mockImplementation(() => {
        callTimes.push(Date.now());
        return Promise.reject(networkError);
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      await stableRequest({
        reqData,
        attempts: 3,
        wait: 50,
        retryStrategy: RETRY_STRATEGIES.EXPONENTIAL,
      });
      
      expect(callTimes.length).toBe(3);
      // Second retry should have longer delay than first
      if (callTimes.length >= 3) {
        const firstDelay = callTimes[1] - callTimes[0];
        const secondDelay = callTimes[2] - callTimes[1];
        expect(secondDelay).toBeGreaterThanOrEqual(firstDelay);
      }
    });
  });

  describe('Hooks', () => {
    it('should call handleSuccessfulAttemptData on successful response', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { data: 'test' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const handleSuccessfulAttemptData = jest.fn();
      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      await stableRequest({
        reqData,
        handleSuccessfulAttemptData,
        logAllSuccessfulAttempts: true,
      });
      
      expect(handleSuccessfulAttemptData).toHaveBeenCalled();
    });

    it('should call handleErrors on failure', async () => {
      const networkError = new Error('Network Error') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ERR_NETWORK';
      mockedAxios.request.mockRejectedValueOnce(networkError);

      const handleErrors = jest.fn();
      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      await stableRequest({
        reqData,
        handleErrors,
        logAllErrors: true,
        attempts: 1,
      });
      
      expect(handleErrors).toHaveBeenCalled();
    });

    it('should use responseAnalyzer to validate responses', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: { valid: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const responseAnalyzer = jest.fn().mockReturnValue(true);
      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        responseAnalyzer,
      });
      
      expect(result.success).toBe(true);
      expect(responseAnalyzer).toHaveBeenCalled();
    });

    it('should use finalErrorAnalyzer for final error handling', async () => {
      const networkError = new Error('Network Error') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ERR_NETWORK';
      mockedAxios.request.mockRejectedValue(networkError);

      const finalErrorAnalyzer = jest.fn().mockReturnValue(false);
      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        finalErrorAnalyzer,
        attempts: 2,
        wait: 10,
      });
      
      expect(result.success).toBe(false);
      expect(finalErrorAnalyzer).toHaveBeenCalled();
    });
  });

  describe('Response Parsing', () => {
    it('should parse JSON response correctly', async () => {
      const responseData = { user: { id: 1, name: 'John' } };
      mockedAxios.request.mockResolvedValueOnce({
        data: responseData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/user' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({ reqData, resReq: true });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(responseData);
    });

    it('should handle empty response body', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: null,
        status: 204,
        statusText: 'No Content',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/delete' as const,
        method: REQUEST_METHODS.DELETE,
      };

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
    });
  });

  describe('Request Configuration', () => {
    it('should respect custom port', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        port: 8080,
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      await stableRequest({ reqData });
      
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining(':8080'),
        })
      );
    });

    it('should handle different content types in headers', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const reqData = {
        hostname: 'api.example.com',
        path: '/upload' as const,
        method: REQUEST_METHODS.POST,
        headers: { 'Content-Type': 'multipart/form-data' },
        body: { file: 'data' },
      };

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
    });
  });

  describe('Perform All Attempts', () => {
    it('should perform all attempts when enabled', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({
          data: { attempt: 1 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        })
        .mockResolvedValueOnce({
          data: { attempt: 2 },
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
        attempts: 2,
        performAllAttempts: true,
        wait: 10,
      });
      
      expect(result.success).toBe(true);
      expect(mockedAxios.request).toHaveBeenCalledTimes(2);
    });

    it('should collect successful attempts data', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({
          data: { id: 1 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        })
        .mockResolvedValueOnce({
          data: { id: 2 },
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
        attempts: 2,
        performAllAttempts: true,
        logAllSuccessfulAttempts: true,
        wait: 10,
      });
      
      expect(result.success).toBe(true);
      expect(result.successfulAttempts).toBeDefined();
      expect(result.successfulAttempts?.length).toBe(2);
    });
  });

  describe('Error Logging', () => {
    it('should log all errors when enabled', async () => {
      const networkError = new Error('Connection Reset') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ECONNRESET'; // Retryable error code

      mockedAxios.request
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          data: {},
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
        attempts: 3,
        wait: 10,
        logAllErrors: true,
      });
      
      expect(result.success).toBe(true);
      expect(result.errorLogs).toBeDefined();
      expect(result.errorLogs?.length).toBe(2);
    });

    it('should include error details in errorLogs', async () => {
      const networkError = new Error('Connection refused') as any;
      networkError.isAxiosError = true;
      networkError.code = 'ECONNREFUSED';
      mockedAxios.request.mockRejectedValueOnce(networkError);

      const reqData = {
        hostname: 'api.example.com',
        path: '/test' as const,
        method: REQUEST_METHODS.GET,
      };

      const result = await stableRequest({
        reqData,
        attempts: 1,
        logAllErrors: true,
      });
      
      expect(result.success).toBe(false);
      expect(result.errorLogs).toBeDefined();
      expect(result.errorLogs?.[0]).toMatchObject({
        error: expect.any(String),
      });
    });
  });

  describe('Result Metrics', () => {
    it('should include metrics in result when available', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        data: {},
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

      const result = await stableRequest({ reqData });
      
      expect(result.success).toBe(true);
      // Metrics should be present in result
      expect(result.metrics).toBeDefined();
    });
  });
});
