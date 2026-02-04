import { CircuitBreakerConfig, CircuitBreakerPersistedState, InfrastructurePersistence } from '../types/index.js';
import { CircuitBreakerState } from '../enums/index.js';
import { InfrastructurePersistenceCoordinator } from './infrastructure-persistence.js';

export class CircuitBreaker {
    private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
    private readonly config: Required<Omit<CircuitBreakerConfig, 'persistence'>>;
    private readonly persistence?: InfrastructurePersistence<CircuitBreakerPersistedState>;
    private readonly persistenceCoordinator?: InfrastructurePersistenceCoordinator<CircuitBreakerPersistedState>;
    
    private totalRequests: number = 0;
    private failedRequests: number = 0;
    private successfulRequests: number = 0;
    
    private totalAttempts: number = 0;
    private failedAttempts: number = 0;
    private successfulAttempts: number = 0;
    
    private lastFailureTime: number = 0;
    private halfOpenRequests: number = 0;
    private halfOpenSuccesses: number = 0;
    private halfOpenFailures: number = 0;
    
    private stateTransitions: number = 0;
    private lastStateChangeTime: number = Date.now();
    private openCount: number = 0;
    private halfOpenCount: number = 0;
    private totalOpenDuration: number = 0;
    private lastOpenTime: number = 0;
    private recoveryAttempts: number = 0;
    private successfulRecoveries: number = 0;
    private failedRecoveries: number = 0;
    
    private initialized: boolean = false;

    constructor(config: CircuitBreakerConfig) {
        this.config = {
            failureThresholdPercentage: Math.max(0, Math.min(100, config.failureThresholdPercentage)),
            minimumRequests: Math.max(1, config.minimumRequests),
            recoveryTimeoutMs: Math.max(100, config.recoveryTimeoutMs),
            successThresholdPercentage: config.successThresholdPercentage ?? 50,
            halfOpenMaxRequests: config.halfOpenMaxRequests ?? 5,
            trackIndividualAttempts: config.trackIndividualAttempts ?? false
        };
        this.persistence = config.persistence;
        this.persistenceCoordinator = this.persistence
            ? new InfrastructurePersistenceCoordinator(this.persistence, 'circuit-breaker')
            : undefined;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        if (this.persistenceCoordinator) {
            try {
                const persistedState = await this.persistenceCoordinator.load();
                if (persistedState) {
                    this.restoreState(persistedState);
                }
            } catch (error) {
                console.warn('stable-request: Unable to load circuit breaker state from persistence.');
            }
        }
        this.initialized = true;
    }

    private restoreState(persistedState: CircuitBreakerPersistedState): void {
        this.state = persistedState.state;
        this.totalRequests = persistedState.totalRequests;
        this.failedRequests = persistedState.failedRequests;
        this.successfulRequests = persistedState.successfulRequests;
        this.totalAttempts = persistedState.totalAttempts;
        this.failedAttempts = persistedState.failedAttempts;
        this.successfulAttempts = persistedState.successfulAttempts;
        this.lastFailureTime = persistedState.lastFailureTime;
        this.halfOpenRequests = persistedState.halfOpenRequests;
        this.halfOpenSuccesses = persistedState.halfOpenSuccesses;
        this.halfOpenFailures = persistedState.halfOpenFailures;
        this.stateTransitions = persistedState.stateTransitions;
        this.lastStateChangeTime = persistedState.lastStateChangeTime;
        this.openCount = persistedState.openCount;
        this.halfOpenCount = persistedState.halfOpenCount;
        this.totalOpenDuration = persistedState.totalOpenDuration;
        this.lastOpenTime = persistedState.lastOpenTime;
        this.recoveryAttempts = persistedState.recoveryAttempts;
        this.successfulRecoveries = persistedState.successfulRecoveries;
        this.failedRecoveries = persistedState.failedRecoveries;
    }

    private getPersistedState(): CircuitBreakerPersistedState {
        return {
            state: this.state,
            totalRequests: this.totalRequests,
            failedRequests: this.failedRequests,
            successfulRequests: this.successfulRequests,
            totalAttempts: this.totalAttempts,
            failedAttempts: this.failedAttempts,
            successfulAttempts: this.successfulAttempts,
            lastFailureTime: this.lastFailureTime,
            halfOpenRequests: this.halfOpenRequests,
            halfOpenSuccesses: this.halfOpenSuccesses,
            halfOpenFailures: this.halfOpenFailures,
            stateTransitions: this.stateTransitions,
            lastStateChangeTime: this.lastStateChangeTime,
            openCount: this.openCount,
            halfOpenCount: this.halfOpenCount,
            totalOpenDuration: this.totalOpenDuration,
            lastOpenTime: this.lastOpenTime,
            recoveryAttempts: this.recoveryAttempts,
            successfulRecoveries: this.successfulRecoveries,
            failedRecoveries: this.failedRecoveries
        };
    }

    private async persistState(): Promise<void> {
        if (this.persistenceCoordinator) {
            try {
                await this.persistenceCoordinator.store(this.getPersistedState());
            } catch (error) {
                console.warn('stable-request: Unable to store circuit breaker state to persistence.');
            }
        }
    }

    async canExecute(): Promise<boolean> {
        if (this.state === CircuitBreakerState.CLOSED) {
            return true;
        }

        if (this.state === CircuitBreakerState.OPEN) {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;
            if (timeSinceLastFailure >= this.config.recoveryTimeoutMs) {
                this.transitionToHalfOpen();
                return true;
            }
            return false;
        }

        if (this.state === CircuitBreakerState.HALF_OPEN) {
            return this.halfOpenRequests < this.config.halfOpenMaxRequests;
        }

        return false;
    }

    recordSuccess(): void {
        this.totalRequests++;
        this.successfulRequests++;

        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.halfOpenSuccesses++;
            this.halfOpenRequests++;
            this.checkHalfOpenTransition();
        } else if (this.state === CircuitBreakerState.CLOSED) {
            if (this.shouldResetCounters()) {
                this.resetCounters();
            }
        }
        
        this.persistState();
    }

    recordFailure(): void {
        this.totalRequests++;
        this.failedRequests++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.halfOpenFailures++;
            this.halfOpenRequests++;
            this.checkHalfOpenTransition();
        } else if (this.state === CircuitBreakerState.CLOSED) {
            this.checkThreshold();
        }
        
        this.persistState();
    }

    recordAttemptSuccess(): void {
        this.totalAttempts++;
        this.successfulAttempts++;

        if (this.state === CircuitBreakerState.CLOSED) {
            if (this.config.trackIndividualAttempts) {
                this.checkAttemptThreshold();
            }
            if (this.shouldResetCounters()) {
                this.resetCounters();
            }
        }
        
        this.persistState();
    }

    recordAttemptFailure(): void {
        this.totalAttempts++;
        this.failedAttempts++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitBreakerState.CLOSED) {
            if (this.config.trackIndividualAttempts) {
                this.checkAttemptThreshold();
            }
        }
        
        this.persistState();
    }

    private checkThreshold(): void {
        if (this.totalRequests < this.config.minimumRequests) {
            return;
        }

        const failurePercentage = (this.failedRequests / this.totalRequests) * 100;
        
        if (failurePercentage >= this.config.failureThresholdPercentage) {
            this.transitionToOpen();
        }
    }

    private checkAttemptThreshold(): void {
        if (this.totalAttempts < this.config.minimumRequests) {
            return;
        }

        const failurePercentage = (this.failedAttempts / this.totalAttempts) * 100;
        
        if (failurePercentage >= this.config.failureThresholdPercentage) {
            this.transitionToOpen();
        }
    }

    private checkHalfOpenTransition(): void {
        if (this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
            const successPercentage = (this.halfOpenSuccesses / this.halfOpenRequests) * 100;
            
            if (successPercentage >= this.config.successThresholdPercentage) {
                this.transitionToClosed();
            } else {
                this.transitionToOpen();
            }
        }
    }

    private transitionToClosed(): void {
        const now = Date.now();
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.successfulRecoveries++;
        }
        if (this.state === CircuitBreakerState.OPEN && this.lastOpenTime > 0) {
            this.totalOpenDuration += (now - this.lastOpenTime);
        }
        this.state = CircuitBreakerState.CLOSED;
        this.lastStateChangeTime = now;
        this.stateTransitions++;
        this.resetCounters();
        this.resetHalfOpenCounters();
        this.persistState();
    }

    private transitionToOpen(): void {
        const now = Date.now();
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.failedRecoveries++;
        }
        this.state = CircuitBreakerState.OPEN;
        this.lastStateChangeTime = now;
        this.lastOpenTime = now;
        this.stateTransitions++;
        this.openCount++;
        this.resetHalfOpenCounters();
        this.persistState();
    }

    private transitionToHalfOpen(): void {
        const now = Date.now();
        if (this.state === CircuitBreakerState.OPEN && this.lastOpenTime > 0) {
            this.totalOpenDuration += (now - this.lastOpenTime);
        }
        this.state = CircuitBreakerState.HALF_OPEN;
        this.lastStateChangeTime = now;
        this.stateTransitions++;
        this.halfOpenCount++;
        this.recoveryAttempts++;
        this.resetHalfOpenCounters();
        this.persistState();
    }

    private shouldResetCounters(): boolean {
        const threshold = this.config.trackIndividualAttempts 
            ? this.totalAttempts >= this.config.minimumRequests * 10
            : this.totalRequests >= this.config.minimumRequests * 10;
        return threshold;
    }

    private resetCounters(): void {
        this.totalRequests = 0;
        this.failedRequests = 0;
        this.successfulRequests = 0;
        this.totalAttempts = 0;
        this.failedAttempts = 0;
        this.successfulAttempts = 0;
    }

    private resetHalfOpenCounters(): void {
        this.halfOpenRequests = 0;
        this.halfOpenSuccesses = 0;
        this.halfOpenFailures = 0;
    }

    getState(): {
        state: CircuitBreakerState;
        totalRequests: number;
        failedRequests: number;
        successfulRequests: number;
        failurePercentage: number;
        totalAttempts: number;
        failedAttempts: number;
        successfulAttempts: number;
        attemptFailurePercentage: number;
        config: Required<Omit<CircuitBreakerConfig, 'persistence'>>;
        stateTransitions: number;
        lastStateChangeTime: number;
        openCount: number;
        halfOpenCount: number;
        totalOpenDuration: number;
        averageOpenDuration: number;
        recoveryAttempts: number;
        successfulRecoveries: number;
        failedRecoveries: number;
        recoverySuccessRate: number;
        openUntil: number | null;
    } {
        const now = Date.now();
        const openUntil = this.state === CircuitBreakerState.OPEN 
            ? this.lastFailureTime + this.config.recoveryTimeoutMs
            : null;
        
        return {
            state: this.state,
            totalRequests: this.totalRequests,
            failedRequests: this.failedRequests,
            successfulRequests: this.successfulRequests,
            failurePercentage: this.totalRequests > 0 
                ? (this.failedRequests / this.totalRequests) * 100 
                : 0,
            totalAttempts: this.totalAttempts,
            failedAttempts: this.failedAttempts,
            successfulAttempts: this.successfulAttempts,
            attemptFailurePercentage: this.totalAttempts > 0
                ? (this.failedAttempts / this.totalAttempts) * 100
                : 0,
            config: this.config,
            stateTransitions: this.stateTransitions,
            lastStateChangeTime: this.lastStateChangeTime,
            openCount: this.openCount,
            halfOpenCount: this.halfOpenCount,
            totalOpenDuration: this.totalOpenDuration,
            averageOpenDuration: this.openCount > 0 ? this.totalOpenDuration / this.openCount : 0,
            recoveryAttempts: this.recoveryAttempts,
            successfulRecoveries: this.successfulRecoveries,
            failedRecoveries: this.failedRecoveries,
            recoverySuccessRate: this.recoveryAttempts > 0 
                ? (this.successfulRecoveries / this.recoveryAttempts) * 100 
                : 0,
            openUntil: openUntil
        };
    }

    reset(): void {
        this.state = CircuitBreakerState.CLOSED;
        this.resetCounters();
        this.resetHalfOpenCounters();
        this.lastFailureTime = 0;
        this.persistState();
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        const canExecute = await this.canExecute();
        
        if (!canExecute) {
            throw new CircuitBreakerOpenError(
                `stable-request: Circuit breaker is ${this.state}. Request blocked.`
            );
        }

        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }
}

export class CircuitBreakerOpenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CircuitBreakerOpenError';
    }
}

let globalCircuitBreaker: CircuitBreaker | null = null;

export function getGlobalCircuitBreaker(config?: CircuitBreakerConfig): CircuitBreaker {
    if (!globalCircuitBreaker && config) {
        globalCircuitBreaker = new CircuitBreaker(config);
    }
    return globalCircuitBreaker!;
}

export function resetGlobalCircuitBreaker(): void {
    if (globalCircuitBreaker) {
        globalCircuitBreaker.reset();
    }
    globalCircuitBreaker = null;
}
