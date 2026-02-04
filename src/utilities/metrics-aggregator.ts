import {
    CircuitBreakerDashboardMetrics,
    CacheDashboardMetrics,
} from '../types/index.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { CacheManager } from './cache-manager.js';

export class MetricsAggregator {

    static extractCircuitBreakerMetrics(circuitBreaker: CircuitBreaker): CircuitBreakerDashboardMetrics {
        const state = circuitBreaker.getState();
        const now = Date.now();
        
        return {
            state: state.state,
            isHealthy: state.state === 'CLOSED',
            totalRequests: state.totalRequests,
            successfulRequests: state.successfulRequests,
            failedRequests: state.failedRequests,
            failurePercentage: state.failurePercentage,
            stateTransitions: state.stateTransitions,
            lastStateChangeTime: state.lastStateChangeTime,
            timeSinceLastStateChange: now - state.lastStateChangeTime,
            openCount: state.openCount,
            totalOpenDuration: state.totalOpenDuration,
            averageOpenDuration: state.averageOpenDuration,
            isCurrentlyOpen: state.state === 'OPEN',
            openUntil: state.openUntil,
            timeUntilRecovery: state.openUntil ? Math.max(0, state.openUntil - now) : null,
            recoveryAttempts: state.recoveryAttempts,
            successfulRecoveries: state.successfulRecoveries,
            failedRecoveries: state.failedRecoveries,
            recoverySuccessRate: state.recoverySuccessRate,
            config: state.config
        };
    }
    
    static extractCacheMetrics(cacheManager: CacheManager): CacheDashboardMetrics {
        const stats = cacheManager.getStats();
        const now = Date.now();
        
        return {
            isEnabled: true,
            currentSize: stats.size,
            maxSize: stats.maxSize,
            validEntries: stats.validEntries,
            expiredEntries: stats.expiredEntries,
            utilizationPercentage: stats.utilizationPercentage,
            totalRequests: stats.totalRequests,
            hits: stats.hits,
            misses: stats.misses,
            hitRate: stats.hitRate,
            missRate: stats.missRate,
            sets: stats.sets,
            evictions: stats.evictions,
            expirations: stats.expirations,
            averageGetTime: stats.averageGetTime,
            averageSetTime: stats.averageSetTime,
            averageCacheAge: stats.averageCacheAge,
            oldestEntryAge: stats.oldestEntry ? now - stats.oldestEntry : null,
            newestEntryAge: stats.newestEntry ? now - stats.newestEntry : null,
            networkRequestsSaved: stats.hits,
            cacheEfficiency: stats.totalRequests > 0 
                ? ((stats.hits / stats.totalRequests) * 100) 
                : 0
        };
    }
}
