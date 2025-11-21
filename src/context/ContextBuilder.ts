import { ModelFormat } from '../prompts/processors/models';
import {
	ITokenizer,
	TokenBudget,
	TokenizerFactory,
	TokenEstimate,
} from './Tokenizer';

/**
 * Context source types
 */
export type ContextSourceType =
	| 'prefix' // Code before cursor
	| 'suffix' // Code after cursor
	| 'imports' // Import statements
	| 'definitions' // Type/class definitions
	| 'related'; // Related file content

/**
 * A piece of context with metadata
 */
export interface ContextPiece {
	/** Source type for prioritization */
	type: ContextSourceType;
	/** The actual content */
	content: string;
	/** Priority (higher = more important, kept when truncating) */
	priority: number;
	/** File path if from external source */
	filePath?: string;
}

/**
 * Built context ready for prompt assembly
 */
export interface BuiltContext {
	/** Code before cursor (truncated to budget) */
	prefix: string;
	/** Code after cursor (truncated to budget) */
	suffix: string;
	/** Additional context pieces */
	additional: ContextPiece[];
	/** Token counts for each section */
	tokenCounts: {
		prefix: number;
		suffix: number;
		additional: number;
		total: number;
	};
	/** Whether any section was truncated */
	wasTruncated: boolean;
}

/**
 * Context builder configuration
 */
export interface ContextBuilderConfig {
	/** Model format for tokenization */
	format: ModelFormat;
	/** Token budget (or use defaults) */
	budget?: TokenBudget;
	/** Maximum tokens for context window */
	maxContextTokens?: number;
	/** Maximum tokens for response */
	maxResponseTokens?: number;
}

/**
 * Context builder for assembling FIM prompts
 *
 * Manages token budget allocation across prefix, suffix, and additional
 * context sources. Ensures context fits within model limits while
 * preserving the most important information.
 *
 * Priority order (highest first):
 * 1. Immediate prefix (lines closest to cursor)
 * 2. Immediate suffix (lines closest to cursor)
 * 3. Import statements
 * 4. Type definitions
 * 5. Extended prefix
 * 6. Related file content
 */
export class ContextBuilder {
	private readonly tokenizer: ITokenizer;
	private readonly budget: TokenBudget;

	private prefix: string = '';
	private suffix: string = '';
	private additionalPieces: ContextPiece[] = [];

	constructor(config: ContextBuilderConfig) {
		this.tokenizer = TokenizerFactory.create(config.format);
		this.budget =
			config.budget ??
			TokenizerFactory.createBudget(
				config.format,
				config.maxContextTokens,
				config.maxResponseTokens
			);
	}

	/**
	 * Set the prefix (code before cursor)
	 * @param content Code content before cursor
	 * @returns this for chaining
	 */
	setPrefix(content: string): this {
		this.prefix = content;
		return this;
	}

	/**
	 * Set the suffix (code after cursor)
	 * @param content Code content after cursor
	 * @returns this for chaining
	 */
	setSuffix(content: string): this {
		this.suffix = content;
		return this;
	}

	/**
	 * Add import statements context
	 * @param imports Import statements content
	 * @param filePath Optional source file path
	 * @returns this for chaining
	 */
	addImports(imports: string, filePath?: string): this {
		if (imports.trim()) {
			this.additionalPieces.push({
				type: 'imports',
				content: imports,
				priority: 80, // High priority
				filePath,
			});
		}
		return this;
	}

	/**
	 * Add type/class definitions context
	 * @param definitions Type definitions content
	 * @param filePath Optional source file path
	 * @returns this for chaining
	 */
	addDefinitions(definitions: string, filePath?: string): this {
		if (definitions.trim()) {
			this.additionalPieces.push({
				type: 'definitions',
				content: definitions,
				priority: 70,
				filePath,
			});
		}
		return this;
	}

	/**
	 * Add related file content
	 * @param content File content
	 * @param filePath Source file path
	 * @param priority Custom priority (default: 50)
	 * @returns this for chaining
	 */
	addRelated(content: string, filePath: string, priority = 50): this {
		if (content.trim()) {
			this.additionalPieces.push({
				type: 'related',
				content,
				priority,
				filePath,
			});
		}
		return this;
	}

	/**
	 * Add a custom context piece
	 * @param piece Context piece to add
	 * @returns this for chaining
	 */
	addPiece(piece: ContextPiece): this {
		if (piece.content.trim()) {
			this.additionalPieces.push(piece);
		}
		return this;
	}

	/**
	 * Build the final context within token budget
	 * @returns Built context with token counts
	 */
	build(): BuiltContext {
		let wasTruncated = false;

		// Truncate prefix (keep end - most relevant to cursor)
		let truncatedPrefix = this.prefix;
		const prefixEstimate = this.tokenizer.countTokens(this.prefix);
		if (prefixEstimate.tokens > this.budget.prefix) {
			truncatedPrefix = this.tokenizer.truncateToTokens(
				this.prefix,
				this.budget.prefix,
				true // from end (keep content closest to cursor)
			);
			wasTruncated = true;
		}

		// Truncate suffix (keep beginning - most relevant to cursor)
		let truncatedSuffix = this.suffix;
		const suffixEstimate = this.tokenizer.countTokens(this.suffix);
		if (suffixEstimate.tokens > this.budget.suffix) {
			truncatedSuffix = this.tokenizer.truncateToTokens(
				this.suffix,
				this.budget.suffix,
				false // from beginning (keep content closest to cursor)
			);
			wasTruncated = true;
		}

		// Calculate remaining budget for additional context
		const prefixTokens = this.tokenizer.countTokens(truncatedPrefix).tokens;
		const suffixTokens = this.tokenizer.countTokens(truncatedSuffix).tokens;
		const usedTokens = prefixTokens + suffixTokens + this.budget.overhead;
		const availableForAdditional = Math.max(
			0,
			this.budget.total - this.budget.response - usedTokens
		);

		// Select and truncate additional pieces by priority
		const selectedAdditional = this.selectAdditionalPieces(
			availableForAdditional
		);
		if (
			selectedAdditional.length < this.additionalPieces.length ||
			selectedAdditional.some(
				(p, i) => p.content !== this.additionalPieces[i]?.content
			)
		) {
			wasTruncated = true;
		}

		// Calculate final token counts
		const additionalTokens = selectedAdditional.reduce(
			(sum, p) => sum + this.tokenizer.countTokens(p.content).tokens,
			0
		);

		return {
			prefix: truncatedPrefix,
			suffix: truncatedSuffix,
			additional: selectedAdditional,
			tokenCounts: {
				prefix: prefixTokens,
				suffix: suffixTokens,
				additional: additionalTokens,
				total: prefixTokens + suffixTokens + additionalTokens,
			},
			wasTruncated,
		};
	}

	/**
	 * Get token estimate for current content
	 * @returns Token estimates for each section
	 */
	estimateTokens(): {
		prefix: TokenEstimate;
		suffix: TokenEstimate;
		additional: TokenEstimate;
		total: number;
	} {
		const prefix = this.tokenizer.countTokens(this.prefix);
		const suffix = this.tokenizer.countTokens(this.suffix);
		const additional = this.additionalPieces.reduce(
			(sum, p) => sum + this.tokenizer.countTokens(p.content).tokens,
			0
		);

		return {
			prefix,
			suffix,
			additional: { tokens: additional, isExact: false },
			total: prefix.tokens + suffix.tokens + additional,
		};
	}

	/**
	 * Get the token budget
	 * @returns Current token budget
	 */
	getBudget(): TokenBudget {
		return { ...this.budget };
	}

	/**
	 * Reset builder for reuse
	 * @returns this for chaining
	 */
	reset(): this {
		this.prefix = '';
		this.suffix = '';
		this.additionalPieces = [];
		return this;
	}

	/**
	 * Select additional pieces that fit within budget
	 * @param availableTokens Tokens available for additional context
	 * @returns Selected pieces (may be truncated)
	 */
	private selectAdditionalPieces(availableTokens: number): ContextPiece[] {
		if (availableTokens <= 0 || this.additionalPieces.length === 0) {
			return [];
		}

		// Sort by priority (highest first)
		const sorted = [...this.additionalPieces].sort(
			(a, b) => b.priority - a.priority
		);

		const selected: ContextPiece[] = [];
		let remainingTokens = availableTokens;

		for (const piece of sorted) {
			const estimate = this.tokenizer.countTokens(piece.content);

			if (estimate.tokens <= remainingTokens) {
				// Piece fits entirely
				selected.push(piece);
				remainingTokens -= estimate.tokens;
			} else if (remainingTokens > 50) {
				// Try to fit a truncated version (minimum 50 tokens)
				const truncated = this.tokenizer.truncateToTokens(
					piece.content,
					remainingTokens,
					false
				);
				if (truncated.length > 0) {
					selected.push({
						...piece,
						content: truncated,
					});
				}
				break; // No more room after truncation
			}
		}

		return selected;
	}
}
