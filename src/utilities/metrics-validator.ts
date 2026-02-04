import type {
  MetricGuardrail,
  MetricsGuardrails,
  MetricAnomaly,
  MetricsValidationResult
} from '../types/index.js';
import { AnomalySeverity as AnomalySeverityEnum, ViolationType as ViolationTypeEnum } from '../enums/index.js';
import {
  REQUEST_METRICS_TO_VALIDATE_KEYS,
  CIRCUIT_BREAKER_METRICS_TO_VALIDATE_KEYS,
  CACHE_METRICS_TO_VALIDATE_KEYS,
  STABLE_BUFFER_METRICS_TO_VALIDATE_KEYS
} from '../constants/index.js';

export class MetricsValidator {
  private static validateMetric(
    metricName: string,
    metricValue: number,
    guardrail: MetricGuardrail
  ): MetricAnomaly | null {
    if (guardrail.min !== undefined && metricValue < guardrail.min) {
      return {
        metricName,
        metricValue,
        guardrail,
        severity: this.determineSeverity(metricValue, guardrail, ViolationTypeEnum.BELOW_MIN),
        reason: `${metricName} (${metricValue.toFixed(2)}) is below minimum threshold (${guardrail.min})`,
        violationType: ViolationTypeEnum.BELOW_MIN
      };
    }
    
    if (guardrail.max !== undefined && metricValue > guardrail.max) {
      return {
        metricName,
        metricValue,
        guardrail,
        severity: this.determineSeverity(metricValue, guardrail, ViolationTypeEnum.ABOVE_MAX),
        reason: `${metricName} (${metricValue.toFixed(2)}) exceeds maximum threshold (${guardrail.max})`,
        violationType: ViolationTypeEnum.ABOVE_MAX
      };
    }
    
    if (guardrail.expected !== undefined && guardrail.tolerance !== undefined) {
      const lowerBound = guardrail.expected * (1 - guardrail.tolerance / 100);
      const upperBound = guardrail.expected * (1 + guardrail.tolerance / 100);
      
      if (metricValue < lowerBound || metricValue > upperBound) {
        return {
          metricName,
          metricValue,
          guardrail,
          severity: this.determineSeverity(metricValue, guardrail, ViolationTypeEnum.OUTSIDE_TOLERANCE),
          reason: `${metricName} (${metricValue.toFixed(2)}) is outside expected range (${lowerBound.toFixed(2)} - ${upperBound.toFixed(2)}, expected: ${guardrail.expected} ±${guardrail.tolerance}%)`,
          violationType: ViolationTypeEnum.OUTSIDE_TOLERANCE
        };
      }
    }
    
    return null;
  }
  
  private static determineSeverity(
    value: number,
    guardrail: MetricGuardrail,
    violationType: ViolationTypeEnum
  ): AnomalySeverityEnum {
    if (violationType === ViolationTypeEnum.BELOW_MIN && guardrail.min !== undefined) {
      const deviation = ((guardrail.min - value) / guardrail.min) * 100;
      if (deviation > 50) return AnomalySeverityEnum.CRITICAL;
      if (deviation > 20) return AnomalySeverityEnum.WARNING;
      return AnomalySeverityEnum.INFO;
    }
    
    if (violationType === ViolationTypeEnum.ABOVE_MAX && guardrail.max !== undefined) {
      const deviation = ((value - guardrail.max) / guardrail.max) * 100;
      if (deviation > 50) return AnomalySeverityEnum.CRITICAL;
      if (deviation > 20) return AnomalySeverityEnum.WARNING;
      return AnomalySeverityEnum.INFO;
    }
    
    if (violationType === ViolationTypeEnum.OUTSIDE_TOLERANCE && guardrail.expected !== undefined && guardrail.tolerance !== undefined) {
      const deviation = Math.abs((value - guardrail.expected) / guardrail.expected) * 100;
      if (deviation > guardrail.tolerance * 2) return AnomalySeverityEnum.CRITICAL;
      if (deviation > guardrail.tolerance * 1.5) return AnomalySeverityEnum.WARNING;
      return AnomalySeverityEnum.INFO;
    }
    
    return AnomalySeverityEnum.WARNING;
  }
  
  static validateRequestMetrics(
    metrics: {
      totalAttempts?: number;
      successfulAttempts?: number;
      failedAttempts?: number;
      totalExecutionTime?: number;
      averageAttemptTime?: number;
    },
    guardrails: MetricsGuardrails
  ): MetricsValidationResult {
    const anomalies: MetricAnomaly[] = [];
    const requestGuardrails = guardrails.request || {};
    
    const metricsToValidate: Array<{ name: string; value: number | undefined; guardrail: MetricGuardrail | undefined }> = [
      { name: REQUEST_METRICS_TO_VALIDATE_KEYS[0], value: metrics.totalAttempts, guardrail: requestGuardrails.totalAttempts },
      { name: REQUEST_METRICS_TO_VALIDATE_KEYS[1], value: metrics.successfulAttempts, guardrail: requestGuardrails.successfulAttempts },
      { name: REQUEST_METRICS_TO_VALIDATE_KEYS[2], value: metrics.failedAttempts, guardrail: requestGuardrails.failedAttempts },
      { name: REQUEST_METRICS_TO_VALIDATE_KEYS[3], value: metrics.totalExecutionTime, guardrail: requestGuardrails.totalExecutionTime || guardrails.common?.executionTime },
      { name: REQUEST_METRICS_TO_VALIDATE_KEYS[4], value: metrics.averageAttemptTime, guardrail: requestGuardrails.averageAttemptTime }
    ];
    
    for (const { name, value, guardrail } of metricsToValidate) {
      if (value !== undefined && guardrail) {
        const anomaly = this.validateMetric(name, value, guardrail);
        if (anomaly) anomalies.push(anomaly);
      }
    }
    
    return {
      isValid: anomalies.length === 0,
      anomalies,
      validatedAt: new Date().toISOString()
    };
  }

  static validateCircuitBreakerMetrics(
    metrics: {
      failureRate?: number;
      totalRequests?: number;
      failedRequests?: number;
    },
    guardrails: MetricsGuardrails
  ): MetricsValidationResult {
    const anomalies: MetricAnomaly[] = [];
    const cbGuardrails = guardrails.infrastructure?.circuitBreaker || {};
    
    const metricsToValidate: Array<{ name: string; value: number | undefined; guardrail: MetricGuardrail | undefined }> = [
      { name: CIRCUIT_BREAKER_METRICS_TO_VALIDATE_KEYS[0], value: metrics.failureRate, guardrail: cbGuardrails.failureRate },
      { name: CIRCUIT_BREAKER_METRICS_TO_VALIDATE_KEYS[1], value: metrics.totalRequests, guardrail: cbGuardrails.totalRequests },
      { name: CIRCUIT_BREAKER_METRICS_TO_VALIDATE_KEYS[2], value: metrics.failedRequests, guardrail: cbGuardrails.failedRequests }
    ];
    
    for (const { name, value, guardrail } of metricsToValidate) {
      if (value !== undefined && guardrail) {
        const anomaly = this.validateMetric(name, value, guardrail);
        if (anomaly) anomalies.push(anomaly);
      }
    }
    
    return {
      isValid: anomalies.length === 0,
      anomalies,
      validatedAt: new Date().toISOString()
    };
  }

  static validateCacheMetrics(
    metrics: {
      hitRate?: number;
      missRate?: number;
      utilizationPercentage?: number;
      evictionRate?: number;
    },
    guardrails: MetricsGuardrails
  ): MetricsValidationResult {
    const anomalies: MetricAnomaly[] = [];
    const cacheGuardrails = guardrails.infrastructure?.cache || {};
    
    const metricsToValidate: Array<{ name: string; value: number | undefined; guardrail: MetricGuardrail | undefined }> = [
      { name: CACHE_METRICS_TO_VALIDATE_KEYS[0], value: metrics.hitRate, guardrail: cacheGuardrails.hitRate },
      { name: CACHE_METRICS_TO_VALIDATE_KEYS[1], value: metrics.missRate, guardrail: cacheGuardrails.missRate },
      { name: CACHE_METRICS_TO_VALIDATE_KEYS[2], value: metrics.utilizationPercentage, guardrail: cacheGuardrails.utilizationPercentage },
      { name: CACHE_METRICS_TO_VALIDATE_KEYS[3], value: metrics.evictionRate, guardrail: cacheGuardrails.evictionRate }
    ];
    
    for (const { name, value, guardrail } of metricsToValidate) {
      if (value !== undefined && guardrail) {
        const anomaly = this.validateMetric(name, value, guardrail);
        if (anomaly) anomalies.push(anomaly);
      }
    }
    
    return {
      isValid: anomalies.length === 0,
      anomalies,
      validatedAt: new Date().toISOString()
    };
  }

  static validateStableBufferMetrics(
    metrics: {
      totalTransactions?: number;
      averageQueueWaitMs?: number;
    },
    guardrails: MetricsGuardrails
  ): MetricsValidationResult {
    const anomalies: MetricAnomaly[] = [];
    const bufferGuardrails = guardrails.stableBuffer || {};
    
    const metricsToValidate: Array<{ name: string; value: number | undefined; guardrail: MetricGuardrail | undefined }> = [
      { name: STABLE_BUFFER_METRICS_TO_VALIDATE_KEYS[0], value: metrics.totalTransactions, guardrail: bufferGuardrails.totalTransactions },
      { name: STABLE_BUFFER_METRICS_TO_VALIDATE_KEYS[1], value: metrics.averageQueueWaitMs, guardrail: bufferGuardrails.averageQueueWaitMs }
    ];
    
    for (const { name, value, guardrail } of metricsToValidate) {
      if (value !== undefined && guardrail) {
        const anomaly = this.validateMetric(name, value, guardrail);
        if (anomaly) anomalies.push(anomaly);
      }
    }
    
    return {
      isValid: anomalies.length === 0,
      anomalies,
      validatedAt: new Date().toISOString()
    };
  }
}
