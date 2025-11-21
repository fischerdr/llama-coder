import { info } from '../modules/log';

/**
 * Cache entry for a completion
 */
export interface CacheEntry<T> {
	/** Cached value */
	value: T;
	/** Timestamp when entry was created */
	timestamp: number;
	/** Number of times this entry was accessed */
	accessCount: number;
	/** Last access timestamp */
	lastAccess: number;
}

/**
 * Cache key components for semantic matching
 */
export interface CacheKey {
	/** Prefix content (or hash) */
	prefix: string;
	/** Suffix content (or hash) */
	suffix: string;
	/** File path for context */
	filePath?: string;
	/** Model identifier */
	model?: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
	/** Total number of entries */
	size: number;
	/** Number of cache hits */
	hits: number;
	/** Number of cache misses */
	misses: number;
	/** Hit rate (0-1) */
	hitRate: number;
	/** Total memory estimate in bytes */
	memoryEstimate: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
	/** Maximum number of entries */
	maxSize?: number;
	/** Time-to-live in milliseconds */
	ttlMs?: number;
	/** Enable normalized key matching */
	enableNormalization?: boolean;
	/** Minimum prefix length for caching */
	minPrefixLength?: number;
}

/**
 * Semantic cache for completion results
 *
 * Provides multi-level caching with:
 * - Exact match: Fast lookup for identical prefix/suffix
 * - Normalized match: Whitespace-normalized matching
 * - LRU eviction: Removes least recently used entries
 * - TTL expiration: Auto-expires old entries
 */
export class SemanticCache<T> {
	private cache: Map<string, CacheEntry<T>> = new Map();
	private readonly maxSize: number;
	private readonly ttlMs: number;
	private readonly enableNormalization: boolean;
	private readonly minPrefixLength: number;

	private hits = 0;
	private misses = 0;

	constructor(config: CacheConfig = {}) {
		this.maxSize = config.maxSize ?? 100;
		this.ttlMs = config.ttlMs ?? 5 * 60 * 1000; // 5 minutes default
		this.enableNormalization = config.enableNormalization ?? true;
		this.minPrefixLength = config.minPrefixLength ?? 10;
	}

	/**
	 * Get a cached value
	 * @param key Cache key
	 * @returns Cached value or undefined
	 */
	get(key: CacheKey): T | undefined {
		// Skip if prefix is too short
		if (key.prefix.length < this.minPrefixLength) {
			return undefined;
		}

		// Try exact match first
		const exactKey = this.createKey(key);
		let entry = this.cache.get(exactKey);

		// Try normalized match if exact miss and normalization enabled
		if (!entry && this.enableNormalization) {
			const normalizedKey = this.createNormalizedKey(key);
			entry = this.cache.get(normalizedKey);
		}

		if (entry) {
			// Check TTL
			if (Date.now() - entry.timestamp > this.ttlMs) {
				this.cache.delete(exactKey);
				this.misses++;
				info(`Cache miss (expired): ${this.truncateKey(exactKey)}`);
				return undefined;
			}

			// Update access stats
			entry.accessCount++;
			entry.lastAccess = Date.now();
			this.hits++;
			info(`Cache hit: ${this.truncateKey(exactKey)}`);
			return entry.value;
		}

		this.misses++;
		return undefined;
	}

	/**
	 * Set a cached value
	 * @param key Cache key
	 * @param value Value to cache
	 */
	set(key: CacheKey, value: T): void {
		// Skip if prefix is too short
		if (key.prefix.length < this.minPrefixLength) {
			return;
		}

		// Evict if at capacity
		if (this.cache.size >= this.maxSize) {
			this.evictLRU();
		}

		const cacheKey = this.createKey(key);
		const now = Date.now();

		this.cache.set(cacheKey, {
			value,
			timestamp: now,
			accessCount: 1,
			lastAccess: now,
		});

		// Also store under normalized key if enabled
		if (this.enableNormalization) {
			const normalizedKey = this.createNormalizedKey(key);
			if (normalizedKey !== cacheKey) {
				this.cache.set(normalizedKey, {
					value,
					timestamp: now,
					accessCount: 1,
					lastAccess: now,
				});
			}
		}

		info(`Cache set: ${this.truncateKey(cacheKey)}`);
	}

	/**
	 * Check if a key exists in cache (without updating stats)
	 * @param key Cache key
	 * @returns True if key exists and is not expired
	 */
	has(key: CacheKey): boolean {
		const cacheKey = this.createKey(key);
		const entry = this.cache.get(cacheKey);

		if (!entry) {
			return false;
		}

		// Check TTL
		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.cache.delete(cacheKey);
			return false;
		}

		return true;
	}

	/**
	 * Invalidate entries for a file
	 * @param filePath File path to invalidate
	 */
	invalidateFile(filePath: string): void {
		const keysToDelete: string[] = [];

		for (const key of this.cache.keys()) {
			if (key.includes(filePath)) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			this.cache.delete(key);
		}

		if (keysToDelete.length > 0) {
			info(`Invalidated ${keysToDelete.length} cache entries for ${filePath}`);
		}
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
		info('Cache cleared');
	}

	/**
	 * Get cache statistics
	 * @returns Cache stats
	 */
	getStats(): CacheStats {
		const total = this.hits + this.misses;
		let memoryEstimate = 0;

		for (const entry of this.cache.values()) {
			// Rough estimate: JSON stringify length as bytes
			memoryEstimate += JSON.stringify(entry.value).length;
		}

		return {
			size: this.cache.size,
			hits: this.hits,
			misses: this.misses,
			hitRate: total > 0 ? this.hits / total : 0,
			memoryEstimate,
		};
	}

	/**
	 * Prune expired entries
	 * @returns Number of entries pruned
	 */
	prune(): number {
		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > this.ttlMs) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			this.cache.delete(key);
		}

		if (keysToDelete.length > 0) {
			info(`Pruned ${keysToDelete.length} expired cache entries`);
		}

		return keysToDelete.length;
	}

	/**
	 * Create cache key from components
	 */
	private createKey(key: CacheKey): string {
		const parts = [
			key.prefix.slice(-200), // Last 200 chars of prefix
			key.suffix.slice(0, 100), // First 100 chars of suffix
		];

		if (key.filePath) {
			parts.push(key.filePath);
		}

		if (key.model) {
			parts.push(key.model);
		}

		return parts.join('|');
	}

	/**
	 * Create normalized cache key (whitespace-normalized)
	 */
	private createNormalizedKey(key: CacheKey): string {
		const normalizedPrefix = this.normalizeWhitespace(key.prefix.slice(-200));
		const normalizedSuffix = this.normalizeWhitespace(key.suffix.slice(0, 100));

		const parts = [normalizedPrefix, normalizedSuffix];

		if (key.filePath) {
			parts.push(key.filePath);
		}

		if (key.model) {
			parts.push(key.model);
		}

		return 'N:' + parts.join('|');
	}

	/**
	 * Normalize whitespace in text
	 */
	private normalizeWhitespace(text: string): string {
		return text
			.replace(/\s+/g, ' ') // Collapse whitespace
			.replace(/^\s+|\s+$/g, ''); // Trim
	}

	/**
	 * Evict least recently used entry
	 */
	private evictLRU(): void {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.lastAccess < oldestTime) {
				oldestTime = entry.lastAccess;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
			info(`Evicted LRU cache entry: ${this.truncateKey(oldestKey)}`);
		}
	}

	/**
	 * Truncate key for logging
	 */
	private truncateKey(key: string): string {
		if (key.length <= 50) {
			return key;
		}
		return key.slice(0, 47) + '...';
	}
}
