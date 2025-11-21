import { RetryPolicy } from './RetryPolicy';

describe('RetryPolicy', () => {
	describe('execute', () => {
		it('should return result on first successful attempt', async () => {
			const policy = new RetryPolicy({ maxAttempts: 3 });
			const operation = jest.fn().mockResolvedValue('success');

			const result = await policy.execute(operation);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should retry on failure and succeed', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 10,
				enableJitter: false,
			});
			const operation = jest
				.fn()
				.mockRejectedValueOnce(new Error('Fail 1'))
				.mockRejectedValueOnce(new Error('Fail 2'))
				.mockResolvedValueOnce('success');

			const result = await policy.execute(operation);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should throw error after max attempts', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 10,
				enableJitter: false,
			});
			const operation = jest.fn().mockRejectedValue(new Error('Always fail'));

			await expect(policy.execute(operation)).rejects.toThrow(
				'Operation failed after 3 attempts: Always fail'
			);
			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should respect cancellation via AbortSignal', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 100,
			});
			const abortController = new AbortController();
			const operation = jest.fn().mockRejectedValue(new Error('Fail'));

			// Start the operation
			const promise = policy.execute(operation, abortController.signal);

			// Cancel after first failure
			setTimeout(() => abortController.abort(), 50);

			await expect(promise).rejects.toThrow('Operation cancelled by signal');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should not retry non-retryable errors', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 10,
				isRetryable: (error) => !error.message.includes('fatal'),
			});
			const operation = jest.fn().mockRejectedValue(new Error('fatal error'));

			await expect(policy.execute(operation)).rejects.toThrow('fatal error');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should apply exponential backoff', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 100,
				backoffMultiplier: 2,
				enableJitter: false,
			});
			const operation = jest.fn().mockRejectedValue(new Error('Fail'));

			const start = Date.now();
			await expect(policy.execute(operation)).rejects.toThrow();
			const elapsed = Date.now() - start;

			// Should wait: 100ms (attempt 1→2) + 200ms (attempt 2→3) = 300ms
			// Allow some tolerance for timing
			expect(elapsed).toBeGreaterThanOrEqual(250);
			expect(elapsed).toBeLessThan(500);
		});

		it('should cap delay at maxDelay', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 5,
				initialDelay: 100,
				maxDelay: 150,
				backoffMultiplier: 10,
				enableJitter: false,
			});
			const operation = jest.fn().mockRejectedValue(new Error('Fail'));

			const start = Date.now();
			await expect(policy.execute(operation)).rejects.toThrow();
			const elapsed = Date.now() - start;

			// First delay: 100ms
			// Second delay: 1000ms → capped to 150ms
			// Third delay: 10000ms → capped to 150ms
			// Fourth delay: 100000ms → capped to 150ms
			// Total: 100 + 150 + 150 + 150 = 550ms
			expect(elapsed).toBeGreaterThanOrEqual(500);
			expect(elapsed).toBeLessThan(800);
		});
	});

	describe('executeGenerator', () => {
		it('should yield all values on first successful attempt', async () => {
			const policy = new RetryPolicy({ maxAttempts: 3 });
			const generator = async function* () {
				yield 1;
				yield 2;
				yield 3;
			};

			const values: number[] = [];
			for await (const value of policy.executeGenerator(generator)) {
				values.push(value);
			}

			expect(values).toEqual([1, 2, 3]);
		});

		it('should retry generator on failure', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 10,
				enableJitter: false,
			});
			let attempt = 0;
			const generator = async function* () {
				attempt++;
				if (attempt < 3) {
					throw new Error(`Fail ${attempt}`);
				}
				yield 1;
				yield 2;
			};

			const values: number[] = [];
			for await (const value of policy.executeGenerator(generator)) {
				values.push(value);
			}

			expect(values).toEqual([1, 2]);
			expect(attempt).toBe(3);
		});

		it('should throw error after max attempts', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 10,
				enableJitter: false,
			});
			const generator = async function* (): AsyncGenerator<number> {
				throw new Error('Always fail');
			};

			const promise = (async () => {
				for await (const _ of policy.executeGenerator(generator)) {
					// Should not reach here
				}
			})();

			await expect(promise).rejects.toThrow(
				'Generator operation failed after 3 attempts: Always fail'
			);
		});

		it('should respect cancellation via AbortSignal', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 100,
			});
			const abortController = new AbortController();
			const generator = async function* (): AsyncGenerator<number> {
				throw new Error('Fail');
			};

			// Start the operation
			const promise = (async () => {
				for await (const _ of policy.executeGenerator(
					generator,
					abortController.signal
				)) {
					// Should not reach here
				}
			})();

			// Cancel after first failure
			setTimeout(() => abortController.abort(), 50);

			await expect(promise).rejects.toThrow('Operation cancelled by signal');
		});

		it('should not retry non-retryable errors', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 10,
				isRetryable: (error) => !error.message.includes('fatal'),
			});
			const generator = async function* (): AsyncGenerator<number> {
				throw new Error('fatal error');
			};

			const promise = (async () => {
				for await (const _ of policy.executeGenerator(generator)) {
					// Should not reach here
				}
			})();

			await expect(promise).rejects.toThrow('fatal error');
		});
	});

	describe('forNetworkOperations', () => {
		it('should create policy with network-specific defaults', () => {
			const policy = RetryPolicy.forNetworkOperations();

			expect((policy as any).maxAttempts).toBe(3);
			expect((policy as any).initialDelay).toBe(1000);
			expect((policy as any).maxDelay).toBe(10000);
			expect((policy as any).backoffMultiplier).toBe(2);
			expect((policy as any).enableJitter).toBe(true);
		});

		it('should retry network errors', async () => {
			// Use a fast policy for testing
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 10,
				maxDelay: 50,
				enableJitter: false,
				isRetryable: RetryPolicy.isNetworkRetryable,
			});

			const networkErrors = [
				new Error('Network error'),
				new Error('Connection timeout'),
				new Error('ECONNREFUSED'),
				new Error('ENOTFOUND'),
				new Error('HTTP 500'),
				new Error('HTTP 502'),
				new Error('HTTP 503'),
				new Error('HTTP 504'),
			];

			for (const error of networkErrors) {
				const operation = jest
					.fn()
					.mockRejectedValueOnce(error)
					.mockResolvedValueOnce('success');

				const result = await policy.execute(operation);
				expect(result).toBe('success');
				expect(operation).toHaveBeenCalledTimes(2);

				jest.clearAllMocks();
			}
		});

		it('should not retry client errors', async () => {
			// Use a fast policy for testing
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 10,
				enableJitter: false,
				isRetryable: RetryPolicy.isNetworkRetryable,
			});

			const clientErrors = [
				new Error('HTTP 400: Bad Request'),
				new Error('HTTP 401: Unauthorized'),
				new Error('HTTP 403: Forbidden'),
				new Error('HTTP 404: Not Found'),
			];

			for (const error of clientErrors) {
				const operation = jest.fn().mockRejectedValue(error);

				await expect(policy.execute(operation)).rejects.toThrow(
					error.message
				);
				expect(operation).toHaveBeenCalledTimes(1);

				jest.clearAllMocks();
			}
		});
	});

	describe('jitter', () => {
		it('should add randomness when jitter is enabled', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 50,
				backoffMultiplier: 1,
				enableJitter: true,
			});
			const operation = jest.fn().mockRejectedValue(new Error('Fail'));

			const delays: number[] = [];
			for (let i = 0; i < 5; i++) {
				const start = Date.now();
				await policy.execute(operation).catch(() => {});
				const elapsed = Date.now() - start;
				delays.push(elapsed);
				jest.clearAllMocks();
			}

			// With jitter, delays should vary between 50% and 100% of base delay
			// All delays should be within reasonable bounds (50-150ms per retry, 2 retries)
			delays.forEach((d) => {
				expect(d).toBeGreaterThanOrEqual(40);
				expect(d).toBeLessThan(400);
			});
		});

		it('should produce consistent delays when jitter is disabled', async () => {
			const policy = new RetryPolicy({
				maxAttempts: 3,
				initialDelay: 100,
				backoffMultiplier: 1,
				enableJitter: false,
			});
			const operation = jest.fn().mockRejectedValue(new Error('Fail'));

			const delays: number[] = [];
			for (let i = 0; i < 3; i++) {
				const start = Date.now();
				await policy.execute(operation).catch(() => {});
				const elapsed = Date.now() - start;
				delays.push(elapsed);
				jest.clearAllMocks();
			}

			// Without jitter, delays should be consistent (within timing tolerance)
			const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
			const variance = delays.map((d) => Math.abs(d - avgDelay));
			expect(Math.max(...variance)).toBeLessThan(50);
		});
	});
});
