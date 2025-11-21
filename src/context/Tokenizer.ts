import { ModelFormat } from '../prompts/processors/models';

/**
 * Token estimation result
 */
export interface TokenEstimate {
	/** Estimated token count */
	tokens: number;
	/** Whether this is an exact count or estimate */
	isExact: boolean;
}

/**
 * Tokenizer interface for context budget management
 */
export interface ITokenizer {
	/**
	 * Count tokens in a string
	 * @param text Text to tokenize
	 * @returns Token count estimate
	 */
	countTokens(text: string): TokenEstimate;

	/**
	 * Truncate text to fit within token budget
	 * @param text Text to truncate
	 * @param maxTokens Maximum tokens allowed
	 * @param fromEnd If true, truncate from beginning; if false, truncate from end
	 * @returns Truncated text
	 */
	truncateToTokens(text: string, maxTokens: number, fromEnd?: boolean): string;

	/**
	 * Get average characters per token for this tokenizer
	 * Used for quick estimation when exact count not needed
	 */
	getCharsPerToken(): number;
}

/**
 * Character-based tokenizer estimation
 *
 * Uses empirical ratios for different model families to estimate
 * token counts without loading full tokenizer vocabularies.
 *
 * Ratios are based on typical BPE tokenization:
 * - Code tends to have more tokens per character (shorter tokens)
 * - Natural language has fewer tokens per character
 * - Special characters and whitespace affect ratio
 */
export class EstimationTokenizer implements ITokenizer {
	private readonly charsPerToken: number;

	/**
	 * Create an estimation tokenizer
	 * @param format Model format to estimate for
	 */
	constructor(format: ModelFormat) {
		// Empirical characters-per-token ratios for different models
		// These are conservative estimates based on typical code content
		switch (format) {
			case 'qwen':
				// Qwen2.5-Coder uses a large vocabulary (151k tokens)
				// Efficient on code, roughly 3.5 chars per token for code
				this.charsPerToken = 3.5;
				break;
			case 'deepseek':
				// DeepSeek-Coder uses ~32k vocabulary
				// Slightly less efficient, roughly 3.2 chars per token
				this.charsPerToken = 3.2;
				break;
			default:
				// Conservative default for unknown models
				this.charsPerToken = 3.0;
		}
	}

	countTokens(text: string): TokenEstimate {
		if (!text) {
			return { tokens: 0, isExact: true };
		}

		// Estimate tokens based on character count and ratio
		const tokens = Math.ceil(text.length / this.charsPerToken);

		return {
			tokens,
			isExact: false,
		};
	}

	truncateToTokens(text: string, maxTokens: number, fromEnd = false): string {
		if (!text) {
			return '';
		}

		const estimate = this.countTokens(text);
		if (estimate.tokens <= maxTokens) {
			return text;
		}

		// Calculate approximate character limit
		const maxChars = Math.floor(maxTokens * this.charsPerToken);

		if (fromEnd) {
			// Keep the end, truncate from beginning
			return text.slice(-maxChars);
		} else {
			// Keep the beginning, truncate from end
			return text.slice(0, maxChars);
		}
	}

	getCharsPerToken(): number {
		return this.charsPerToken;
	}
}

/**
 * Line-aware tokenizer wrapper
 *
 * Wraps a base tokenizer to provide line-boundary-aware truncation.
 * This prevents cutting code mid-line which can confuse the model.
 */
export class LineAwareTokenizer implements ITokenizer {
	constructor(private base: ITokenizer) {}

	countTokens(text: string): TokenEstimate {
		return this.base.countTokens(text);
	}

	truncateToTokens(text: string, maxTokens: number, fromEnd = false): string {
		if (!text) {
			return '';
		}

		// First, do a rough truncation
		let truncated = this.base.truncateToTokens(text, maxTokens, fromEnd);

		// Then adjust to line boundaries
		if (fromEnd) {
			// Find first complete line when truncating from beginning
			const newlineIndex = truncated.indexOf('\n');
			if (newlineIndex > 0 && newlineIndex < truncated.length - 1) {
				truncated = truncated.slice(newlineIndex + 1);
			}
		} else {
			// Find last complete line when truncating from end
			const newlineIndex = truncated.lastIndexOf('\n');
			if (newlineIndex > 0) {
				truncated = truncated.slice(0, newlineIndex);
			}
		}

		return truncated;
	}

	getCharsPerToken(): number {
		return this.base.getCharsPerToken();
	}
}

/**
 * Token budget for context building
 */
export interface TokenBudget {
	/** Total tokens available */
	total: number;
	/** Tokens reserved for prefix (code before cursor) */
	prefix: number;
	/** Tokens reserved for suffix (code after cursor) */
	suffix: number;
	/** Tokens reserved for response generation */
	response: number;
	/** Tokens reserved for FIM formatting overhead */
	overhead: number;
}

/**
 * Create a token budget from total context window
 *
 * Default allocation:
 * - 60% prefix (most important context)
 * - 20% suffix
 * - 15% response
 * - 5% overhead (FIM tokens, formatting)
 *
 * @param totalTokens Total context window size
 * @param responseTokens Desired response size (overrides default)
 * @returns Token budget allocation
 */
export function createTokenBudget(
	totalTokens: number,
	responseTokens?: number
): TokenBudget {
	const response = responseTokens ?? Math.floor(totalTokens * 0.15);
	const overhead = Math.floor(totalTokens * 0.05);
	const available = totalTokens - response - overhead;

	// Allocate remaining 75% to prefix, 25% to suffix
	const prefix = Math.floor(available * 0.75);
	const suffix = available - prefix;

	return {
		total: totalTokens,
		prefix,
		suffix,
		response,
		overhead,
	};
}

/**
 * Factory for creating tokenizers
 */
export class TokenizerFactory {
	/**
	 * Create a tokenizer for a model format
	 * @param format Model format
	 * @param lineAware Whether to use line-aware truncation
	 * @returns Tokenizer instance
	 */
	static create(format: ModelFormat, lineAware = true): ITokenizer {
		const base = new EstimationTokenizer(format);
		return lineAware ? new LineAwareTokenizer(base) : base;
	}

	/**
	 * Create a token budget for a model
	 * @param format Model format
	 * @param maxContextTokens Maximum context window (or use default)
	 * @param maxResponseTokens Maximum response tokens (or use default)
	 * @returns Token budget allocation
	 */
	static createBudget(
		format: ModelFormat,
		maxContextTokens?: number,
		maxResponseTokens?: number
	): TokenBudget {
		// Default context windows by model family
		const defaultContext =
			format === 'qwen' ? 32768 : format === 'deepseek' ? 16384 : 8192;

		return createTokenBudget(
			maxContextTokens ?? defaultContext,
			maxResponseTokens
		);
	}
}
