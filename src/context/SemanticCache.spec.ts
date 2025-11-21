import { SemanticCache } from './SemanticCache';

describe('SemanticCache', () => {
	describe('basic operations', () => {
		it('should store and retrieve values', () => {
			const cache = new SemanticCache<string>();
			const key = { prefix: 'function foo() {', suffix: '}' };

			cache.set(key, 'completion result');
			const result = cache.get(key);

			expect(result).toBe('completion result');
		});

		it('should return undefined for missing keys', () => {
			const cache = new SemanticCache<string>();
			const key = { prefix: 'function foo() {', suffix: '}' };

			const result = cache.get(key);

			expect(result).toBeUndefined();
		});

		it('should check if key exists', () => {
			const cache = new SemanticCache<string>();
			const key = { prefix: 'function foo() {', suffix: '}' };

			expect(cache.has(key)).toBe(false);
			cache.set(key, 'result');
			expect(cache.has(key)).toBe(true);
		});

		it('should clear all entries', () => {
			const cache = new SemanticCache<string>();

			cache.set({ prefix: 'prefix1xxxxxxxx', suffix: 's1' }, 'value1');
			cache.set({ prefix: 'prefix2xxxxxxxx', suffix: 's2' }, 'value2');
			cache.clear();

			expect(cache.getStats().size).toBe(0);
		});
	});

	describe('minimum prefix length', () => {
		it('should skip caching for short prefixes', () => {
			const cache = new SemanticCache<string>({ minPrefixLength: 10 });
			const key = { prefix: 'short', suffix: 'suffix' };

			cache.set(key, 'value');
			const result = cache.get(key);

			expect(result).toBeUndefined();
		});

		it('should cache prefixes that meet minimum length', () => {
			const cache = new SemanticCache<string>({ minPrefixLength: 10 });
			const key = { prefix: 'this is a long enough prefix', suffix: 'suffix' };

			cache.set(key, 'value');
			const result = cache.get(key);

			expect(result).toBe('value');
		});
	});

	describe('TTL expiration', () => {
		it('should expire entries after TTL', async () => {
			const cache = new SemanticCache<string>({ ttlMs: 50 });
			const key = { prefix: 'function foo() {', suffix: '}' };

			cache.set(key, 'value');
			expect(cache.get(key)).toBe('value');

			// Wait for TTL
			await new Promise((resolve) => setTimeout(resolve, 60));

			expect(cache.get(key)).toBeUndefined();
		});

		it('should prune expired entries', async () => {
			const cache = new SemanticCache<string>({ ttlMs: 50 });

			cache.set({ prefix: 'prefix1xxxxxxxx', suffix: 's1' }, 'value1');
			cache.set({ prefix: 'prefix2xxxxxxxx', suffix: 's2' }, 'value2');

			// Wait for TTL
			await new Promise((resolve) => setTimeout(resolve, 60));

			const pruned = cache.prune();
			expect(pruned).toBeGreaterThan(0);
			expect(cache.getStats().size).toBe(0);
		});
	});

	describe('LRU eviction', () => {
		it('should evict entries when at capacity', () => {
			const cache = new SemanticCache<string>({
				maxSize: 3,
				enableNormalization: false,
			});

			cache.set({ prefix: 'prefix1xxxxxxxx', suffix: 's1' }, 'value1');
			cache.set({ prefix: 'prefix2xxxxxxxx', suffix: 's2' }, 'value2');
			cache.set({ prefix: 'prefix3xxxxxxxx', suffix: 's3' }, 'value3');

			// At this point cache is full (3 entries)
			expect(cache.getStats().size).toBe(3);

			// Add fourth entry - should evict one entry
			cache.set({ prefix: 'prefix4xxxxxxxx', suffix: 's4' }, 'value4');

			// Should still have 3 entries (one was evicted)
			expect(cache.getStats().size).toBe(3);

			// New entry should be present
			expect(cache.get({ prefix: 'prefix4xxxxxxxx', suffix: 's4' })).toBe('value4');
		});

		it('should not exceed max size', () => {
			const cache = new SemanticCache<string>({
				maxSize: 2,
				enableNormalization: false,
			});

			cache.set({ prefix: 'prefix1xxxxxxxx', suffix: 's1' }, 'value1');
			cache.set({ prefix: 'prefix2xxxxxxxx', suffix: 's2' }, 'value2');
			cache.set({ prefix: 'prefix3xxxxxxxx', suffix: 's3' }, 'value3');
			cache.set({ prefix: 'prefix4xxxxxxxx', suffix: 's4' }, 'value4');

			expect(cache.getStats().size).toBeLessThanOrEqual(2);
		});
	});

	describe('normalized matching', () => {
		it('should match with whitespace differences when enabled', () => {
			const cache = new SemanticCache<string>({ enableNormalization: true });

			cache.set(
				{ prefix: 'function   foo()  {', suffix: '}' },
				'result'
			);

			// Should match with normalized whitespace
			const result = cache.get({
				prefix: 'function foo() {',
				suffix: '}',
			});

			expect(result).toBe('result');
		});

		it('should not match with normalization disabled', () => {
			const cache = new SemanticCache<string>({ enableNormalization: false });

			cache.set(
				{ prefix: 'function   foo()  {', suffix: '}' },
				'result'
			);

			// Should NOT match with different whitespace
			const result = cache.get({
				prefix: 'function foo() {',
				suffix: '}',
			});

			expect(result).toBeUndefined();
		});
	});

	describe('file path context', () => {
		it('should include file path in cache key', () => {
			const cache = new SemanticCache<string>({ enableNormalization: false });

			cache.set(
				{ prefix: 'const x = 1;xxxx', suffix: '', filePath: '/a.ts' },
				'result1'
			);
			cache.set(
				{ prefix: 'const x = 1;xxxx', suffix: '', filePath: '/b.ts' },
				'result2'
			);

			expect(
				cache.get({ prefix: 'const x = 1;xxxx', suffix: '', filePath: '/a.ts' })
			).toBe('result1');
			expect(
				cache.get({ prefix: 'const x = 1;xxxx', suffix: '', filePath: '/b.ts' })
			).toBe('result2');
		});

		it('should invalidate entries for a file', () => {
			const cache = new SemanticCache<string>({ enableNormalization: false });

			cache.set(
				{ prefix: 'const x = 1;xxxx', suffix: '', filePath: '/a.ts' },
				'result1'
			);
			cache.set(
				{ prefix: 'const y = 2;xxxx', suffix: '', filePath: '/a.ts' },
				'result2'
			);
			cache.set(
				{ prefix: 'const z = 3;xxxx', suffix: '', filePath: '/b.ts' },
				'result3'
			);

			cache.invalidateFile('/a.ts');

			expect(
				cache.get({ prefix: 'const x = 1;xxxx', suffix: '', filePath: '/a.ts' })
			).toBeUndefined();
			expect(
				cache.get({ prefix: 'const z = 3;xxxx', suffix: '', filePath: '/b.ts' })
			).toBe('result3');
		});
	});

	describe('model context', () => {
		it('should include model in cache key', () => {
			const cache = new SemanticCache<string>({ enableNormalization: false });

			cache.set(
				{ prefix: 'const x = 1;xxxx', suffix: '', model: 'qwen' },
				'qwen-result'
			);
			cache.set(
				{ prefix: 'const x = 1;xxxx', suffix: '', model: 'deepseek' },
				'deepseek-result'
			);

			expect(
				cache.get({ prefix: 'const x = 1;xxxx', suffix: '', model: 'qwen' })
			).toBe('qwen-result');
			expect(
				cache.get({ prefix: 'const x = 1;xxxx', suffix: '', model: 'deepseek' })
			).toBe('deepseek-result');
		});
	});

	describe('statistics', () => {
		it('should track hits and misses', () => {
			const cache = new SemanticCache<string>();
			const key = { prefix: 'function foo() {', suffix: '}' };

			cache.get(key); // miss
			cache.set(key, 'value');
			cache.get(key); // hit
			cache.get(key); // hit

			const stats = cache.getStats();
			expect(stats.hits).toBe(2);
			expect(stats.misses).toBe(1);
			expect(stats.hitRate).toBeCloseTo(0.667, 2);
		});

		it('should estimate memory usage', () => {
			const cache = new SemanticCache<string>();

			cache.set({ prefix: 'prefixxxxxxxxxxx', suffix: 's' }, 'a'.repeat(100));
			cache.set({ prefix: 'prefix2xxxxxxxxx', suffix: 's' }, 'b'.repeat(200));

			const stats = cache.getStats();
			expect(stats.memoryEstimate).toBeGreaterThan(300);
		});

		it('should reset stats on clear', () => {
			const cache = new SemanticCache<string>();
			const key = { prefix: 'function foo() {', suffix: '}' };

			cache.set(key, 'value');
			cache.get(key);
			cache.clear();

			const stats = cache.getStats();
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
		});
	});
});
