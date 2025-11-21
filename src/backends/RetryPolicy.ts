import { info } from '../modules/log';

/**
 * Retry policy configuration
 */
export interface RetryConfig {
	/** Maximum number of retry attempts (default: 3) */
	maxAttempts?: number;
	/** Initial delay in milliseconds (default: 1000) */
	initialDelay?: number;
	/** Maximum delay in milliseconds (default: 30000) */
	maxDelay?: number;
	/** Exponential backoff multiplier (default: 2) */
	backoffMultiplier?: number;
	/** Enable random jitter to prevent thundering herd (default: true) */
	enableJitter?: boolean;
	/** Predicate to determine if error is retryable (default: all errors) */
	isRetryable?: (error: Error) => boolean;
}

/**
 * Retry policy with exponential backoff and jitter
 *
 * Implements resilient retry logic for network operations with:
 * - Exponential backoff to reduce server load
 * - Random jitter to prevent synchronized retries
 * - Configurable retry conditions
 * - Cancellation support via AbortSignal
 */
export class RetryPolicy {
	private readonly maxAttempts: number;
	private readonly initialDelay: number;
	private readonly maxDelay: number;
	private readonly backoffMultiplier: number;
	private readonly enableJitter: boolean;
	private readonly isRetryable: (error: Error) => boolean;

	constructor(config: RetryConfig = {}) {
		this.maxAttempts = config.maxAttempts ?? 3;
		this.initialDelay = config.initialDelay ?? 1000;
		this.maxDelay = config.maxDelay ?? 30000;
		this.backoffMultiplier = config.backoffMultiplier ?? 2;
		this.enableJitter = config.enableJitter ?? true;
		this.isRetryable = config.isRetryable ?? (() => true);
	}

	/**
	 * Execute an operation with retry logic
	 *
	 * @param operation Async operation to execute
	 * @param signal Optional AbortSignal for cancellation
	 * @returns Result of the operation
	 * @throws Error if all retry attempts fail or operation is cancelled
	 */
	async execute<T>(
		operation: () => Promise<T>,
		signal?: AbortSignal
	): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
			// Check cancellation before attempt
			if (signal?.aborted) {
				throw new Error('Operation cancelled by signal');
			}

			try {
				info(`Retry attempt ${attempt}/${this.maxAttempts}`);
				const result = await operation();
				if (attempt > 1) {
					info(`Operation succeeded on attempt ${attempt}`);
				}
				return result;
			} catch (error) {
				lastError = error as Error;
				info(`Attempt ${attempt} failed: ${lastError.message}`);

				// Don't retry if error is not retryable
				if (!this.isRetryable(lastError)) {
					info(`Error is not retryable: ${lastError.message}`);
					throw lastError;
				}

				// Don't retry on last attempt
				if (attempt >= this.maxAttempts) {
					info(`Max attempts reached (${this.maxAttempts}), giving up`);
					break;
				}

				// Calculate delay with exponential backoff
				const delay = this.calculateDelay(attempt);
				info(`Waiting ${delay}ms before retry...`);

				// Wait with cancellation support
				await this.sleep(delay, signal);
			}
		}

		// All retries failed
		throw new Error(
			`Operation failed after ${this.maxAttempts} attempts: ${lastError?.message}`
		);
	}

	/**
	 * Execute an async generator operation with retry logic
	 *
	 * Retries the entire generator operation if it fails.
	 * Note: This is useful for retrying stream establishment, not individual chunks.
	 *
	 * @param operation Async generator operation to execute
	 * @param signal Optional AbortSignal for cancellation
	 * @yields Values from the operation
	 * @throws Error if all retry attempts fail or operation is cancelled
	 */
	async *executeGenerator<T>(
		operation: () => AsyncGenerator<T, void, unknown>,
		signal?: AbortSignal
	): AsyncGenerator<T, void, unknown> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
			// Check cancellation before attempt
			if (signal?.aborted) {
				throw new Error('Operation cancelled by signal');
			}

			try {
				info(`Retry attempt ${attempt}/${this.maxAttempts} for generator`);
				const generator = operation();

				// Yield all values from the generator
				for await (const value of generator) {
					yield value;
				}

				// Success - generator completed without errors
				if (attempt > 1) {
					info(`Generator succeeded on attempt ${attempt}`);
				}
				return;
			} catch (error) {
				lastError = error as Error;
				info(`Generator attempt ${attempt} failed: ${lastError.message}`);

				// Don't retry if error is not retryable
				if (!this.isRetryable(lastError)) {
					info(`Error is not retryable: ${lastError.message}`);
					throw lastError;
				}

				// Don't retry on last attempt
				if (attempt >= this.maxAttempts) {
					info(`Max attempts reached (${this.maxAttempts}), giving up`);
					break;
				}

				// Calculate delay with exponential backoff
				const delay = this.calculateDelay(attempt);
				info(`Waiting ${delay}ms before retry...`);

				// Wait with cancellation support
				await this.sleep(delay, signal);
			}
		}

		// All retries failed
		throw new Error(
			`Generator operation failed after ${this.maxAttempts} attempts: ${lastError?.message}`
		);
	}

	/**
	 * Calculate delay with exponential backoff and optional jitter
	 *
	 * @param attempt Current attempt number (1-indexed)
	 * @returns Delay in milliseconds
	 */
	private calculateDelay(attempt: number): number {
		// Calculate exponential backoff
		const exponentialDelay =
			this.initialDelay * Math.pow(this.backoffMultiplier, attempt - 1);

		// Cap at max delay
		let delay = Math.min(exponentialDelay, this.maxDelay);

		// Add jitter to prevent thundering herd
		if (this.enableJitter) {
			// Randomize delay between 50% and 100% of calculated delay
			delay = delay * (0.5 + Math.random() * 0.5);
		}

		return Math.floor(delay);
	}

	/**
	 * Sleep for specified duration with cancellation support
	 *
	 * @param ms Duration in milliseconds
	 * @param signal Optional AbortSignal for cancellation
	 * @throws Error if cancelled during sleep
	 */
	private sleep(ms: number, signal?: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			// Check if already cancelled
			if (signal?.aborted) {
				reject(new Error('Operation cancelled by signal'));
				return;
			}

			// Set up cancellation listener
			const onAbort = () => {
				clearTimeout(timeout);
				reject(new Error('Operation cancelled by signal'));
			};

			const timeout = setTimeout(() => {
				signal?.removeEventListener('abort', onAbort);
				resolve();
			}, ms);

			signal?.addEventListener('abort', onAbort);
		});
	}

	/**
	 * Predicate to check if an error is a retryable network error
	 *
	 * Retries:
	 * - Network errors (connection refused, not found, timeout)
	 * - 5xx server errors (500, 502, 503, 504)
	 *
	 * Does not retry:
	 * - 4xx client errors (bad request, unauthorized, forbidden, not found)
	 *
	 * @param error Error to check
	 * @returns True if the error is retryable
	 */
	static isNetworkRetryable(error: Error): boolean {
		const message = error.message.toLowerCase();
		return (
			message.includes('network') ||
			message.includes('timeout') ||
			message.includes('econnrefused') ||
			message.includes('enotfound') ||
			message.includes('http 5') ||
			message.includes('500') ||
			message.includes('502') ||
			message.includes('503') ||
			message.includes('504')
		);
	}

	/**
	 * Create a retry policy for network operations
	 *
	 * Configures sensible defaults for HTTP requests:
	 * - 3 attempts
	 * - 1s initial delay
	 * - 10s max delay
	 * - Only retry network errors (not 4xx client errors)
	 *
	 * @returns Configured retry policy
	 */
	static forNetworkOperations(): RetryPolicy {
		return new RetryPolicy({
			maxAttempts: 3,
			initialDelay: 1000,
			maxDelay: 10000,
			backoffMultiplier: 2,
			enableJitter: true,
			isRetryable: RetryPolicy.isNetworkRetryable,
		});
	}
}
