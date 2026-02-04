import { AxiosRequestConfig } from 'axios';
import { REQUEST_METHODS } from '../enums/index.js';
import { CachedResponse, CacheConfig, CacheManagerPersistedState, InfrastructurePersistence } from '../types/index.js';
import { getNodeCrypto, simpleHashToHex } from './hash-utils.js';
import { InfrastructurePersistenceCoordinator } from './infrastructure-persistence.js';

const nodeCrypto = getNodeCrypto();

export class CacheManager {
    private cache: Map<string, CachedResponse>;
    private config: Required<Omit<CacheConfig, 'keyGenerator' | 'persistence'>> & { keyGenerator?: CacheConfig['keyGenerator'] };
    private accessOrder: string[] = [];
    private hits: number = 0;
    private misses: number = 0;
    private sets: number = 0;
    private evictions: number = 0;
    private expirations: number = 0;
    private totalGetTime: number = 0;
    private totalSetTime: number = 0;
    private readonly persistence?: InfrastructurePersistence<CacheManagerPersistedState>;
    private readonly persistenceCoordinator?: InfrastructurePersistenceCoordinator<CacheManagerPersistedState>;
    private initialized: boolean = false;

    constructor(config: CacheConfig) {
        this.cache = new Map();
        this.config = {
            enabled: config.enabled,
            ttl: config.ttl ?? 300000,
            respectCacheControl: config.respectCacheControl ?? true,
            cacheableStatusCodes: config.cacheableStatusCodes ?? [200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501],
            maxSize: config.maxSize ?? 100,
            excludeMethods: config.excludeMethods ?? [REQUEST_METHODS.POST, REQUEST_METHODS.PUT, REQUEST_METHODS.PATCH, REQUEST_METHODS.DELETE],
            keyGenerator: config.keyGenerator
        };
        this.persistence = config.persistence;
        this.persistenceCoordinator = this.persistence
            ? new InfrastructurePersistenceCoordinator(this.persistence, 'cache-manager')
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
                console.warn('stable-request: Unable to load cache manager state from persistence.');
            }
        }
        this.initialized = true;
    }

    private restoreState(persistedState: CacheManagerPersistedState): void {
        this.cache.clear();
        for (const entry of persistedState.entries) {
            this.cache.set(entry.key, entry.value);
        }
        this.accessOrder = persistedState.accessOrder;
        this.hits = persistedState.hits;
        this.misses = persistedState.misses;
        this.sets = persistedState.sets;
        this.evictions = persistedState.evictions;
        this.expirations = persistedState.expirations;
    }

    private getPersistedState(): CacheManagerPersistedState {
        const entries: CacheManagerPersistedState['entries'] = [];
        for (const [key, value] of this.cache.entries()) {
            entries.push({ key, value });
        }
        return {
            entries,
            accessOrder: this.accessOrder,
            hits: this.hits,
            misses: this.misses,
            sets: this.sets,
            evictions: this.evictions,
            expirations: this.expirations
        };
    }

    private async persistState(): Promise<void> {
        if (this.persistenceCoordinator) {
            try {
                await this.persistenceCoordinator.store(this.getPersistedState());
            } catch (error) {
                console.warn('stable-request: Unable to store cache manager state to persistence.');
            }
        }
    }

    private generateKey(reqConfig: AxiosRequestConfig): string {
        if (this.config.keyGenerator) {
            return this.config.keyGenerator(reqConfig);
        }

        const method = (reqConfig.method || REQUEST_METHODS.GET).toUpperCase();
        const url = reqConfig.url || '';
        const params = reqConfig.params ? JSON.stringify(reqConfig.params) : '';
        
        const relevantHeaders = ['accept', 'accept-encoding', 'accept-language', 'authorization'];
        const headers = reqConfig.headers || {};
        const headerString = relevantHeaders
            .filter(h => headers[h])
            .map(h => `${h}:${headers[h]}`)
            .join('|');

        const keyString = `${method}:${url}:${params}:${headerString}`;

        if (nodeCrypto?.createHash) {
            return nodeCrypto.createHash('sha256').update(keyString).digest('hex');
        }

        return simpleHashToHex(keyString);
    }

    private shouldCacheMethod(method?: string): boolean {
        if (!method) return true;
        return !this.config.excludeMethods.includes(method.toUpperCase() as REQUEST_METHODS);
    }

    private shouldCacheStatus(status: number): boolean {
        return this.config.cacheableStatusCodes.includes(status);
    }

    private parseCacheControl(headers: Record<string, any>): number | null {
        if (!this.config.respectCacheControl) {
            return null;
        }

        const cacheControl = headers['cache-control'] || headers['Cache-Control'];
        if (cacheControl && typeof cacheControl === 'string') {
            if (cacheControl.includes('no-cache') || cacheControl.includes('no-store')) {
                return 0;
            }

            const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
            if (maxAgeMatch) {
                return parseInt(maxAgeMatch[1]) * 1000;
            }
        }

        const expires = headers['expires'] || headers['Expires'];
        if (expires) {
            const expiresDate = new Date(expires);
            const now = new Date();
            const ttl = expiresDate.getTime() - now.getTime();
            return ttl > 0 ? ttl : 0;
        }

        return null;
    }

    get<T = any>(reqConfig: AxiosRequestConfig): CachedResponse<T> | null {
        const startTime = Date.now();
        
        if (!this.config.enabled) {
            return null;
        }

        if (!this.shouldCacheMethod(reqConfig.method)) {
            return null;
        }

        const key = this.generateKey(reqConfig);
        const cached = this.cache.get(key);

        if (!cached) {
            this.misses++;
            this.totalGetTime += (Date.now() - startTime);
            return null;
        }

        const now = Date.now();
        
        if (now > cached.expiresAt) {
            this.cache.delete(key);
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.expirations++;
            this.misses++;
            this.totalGetTime += (Date.now() - startTime);
            return null;
        }

        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.accessOrder.push(key);
        this.hits++;
        this.totalGetTime += (Date.now() - startTime);

        return cached as CachedResponse<T>;
    }

    set<T = any>(
        reqConfig: AxiosRequestConfig,
        data: T,
        status: number,
        statusText: string,
        headers: Record<string, any>
    ): void {
        const startTime = Date.now();
        
        if (!this.config.enabled) {
            return;
        }

        if (!this.shouldCacheMethod(reqConfig.method)) {
            return;
        }

        if (!this.shouldCacheStatus(status)) {
            return;
        }

        const key = this.generateKey(reqConfig);
        const now = Date.now();

        let ttl = this.config.ttl;
        const cacheControlTtl = this.parseCacheControl(headers);
        
        if (cacheControlTtl !== null) {
            if (cacheControlTtl === 0) {
                return;
            }
            ttl = cacheControlTtl;
        }

        const cached: CachedResponse<T> = {
            data,
            status,
            statusText,
            headers,
            timestamp: now,
            expiresAt: now + ttl
        };

        if (this.cache.size >= this.config.maxSize) {
            const oldestKey = this.accessOrder.shift();
            if (oldestKey) {
                this.cache.delete(oldestKey);
                this.evictions++;
            }
        }

        this.cache.set(key, cached);
        this.accessOrder.push(key);
        this.sets++;
        this.totalSetTime += (Date.now() - startTime);
        this.persistState();
    }

    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
        this.persistState();
    }

    delete(reqConfig: AxiosRequestConfig): boolean {
        const key = this.generateKey(reqConfig);
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.persistState();
        }
        return deleted;
    }

    getStats() {
        const now = Date.now();
        const entries = Array.from(this.cache.entries());
        const validEntries = entries.filter(([_, cached]) => now <= cached.expiresAt);
        const totalRequests = this.hits + this.misses;
        const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
        const missRate = totalRequests > 0 ? (this.misses / totalRequests) * 100 : 0;
        const averageAge = validEntries.length > 0
            ? validEntries.reduce((sum, [_, cached]) => sum + (now - cached.timestamp), 0) / validEntries.length
            : 0;

        return {
            size: this.cache.size,
            validEntries: validEntries.length,
            expiredEntries: this.cache.size - validEntries.length,
            maxSize: this.config.maxSize,
            oldestEntry: entries.length > 0 
                ? Math.min(...entries.map(([_, cached]) => cached.timestamp))
                : null,
            newestEntry: entries.length > 0
                ? Math.max(...entries.map(([_, cached]) => cached.timestamp))
                : null,
            hits: this.hits,
            misses: this.misses,
            sets: this.sets,
            evictions: this.evictions,
            expirations: this.expirations,
            totalRequests: totalRequests,
            hitRate: hitRate,
            missRate: missRate,
            averageCacheAge: averageAge,
            averageGetTime: totalRequests > 0 ? this.totalGetTime / totalRequests : 0,
            averageSetTime: this.sets > 0 ? this.totalSetTime / this.sets : 0,
            utilizationPercentage: (this.cache.size / this.config.maxSize) * 100
        };
    }

    prune(): number {
        const now = Date.now();
        let prunedCount = 0;

        for (const [key, cached] of Array.from(this.cache.entries())) {
            if (now > cached.expiresAt) {
                this.cache.delete(key);
                this.accessOrder = this.accessOrder.filter(k => k !== key);
                prunedCount++;
            }
        }

        if (prunedCount > 0) {
            this.persistState();
        }

        return prunedCount;
    }
}

let globalCacheManager: CacheManager | null = null;

export function getGlobalCacheManager(config?: CacheConfig): CacheManager {
    if (!globalCacheManager && config) {
        globalCacheManager = new CacheManager(config);
    }
    return globalCacheManager!;
}

export function resetGlobalCacheManager(): void {
    if (globalCacheManager) {
        globalCacheManager.clear();
    }
    globalCacheManager = null;
}
