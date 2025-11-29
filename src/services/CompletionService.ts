import { info, warn } from '../modules/log';
import { countSymbol } from '../modules/text';
import { ModelFormat, adaptPrompt } from '../prompts/processors/models';
import {
	BackendFactory,
	BackendType,
	IInferenceBackend,
	CompletionRequest,
} from '../backends';
import {
	SemanticCache,
	SessionManager,
	ScopeDetector,
	ContextBuilder,
} from '../context';

/**
 * Completion request configuration
 */
export interface CompletionConfig {
	/** Inference endpoint URL */
	endpoint: string;
	/** Bearer token for authentication */
	bearerToken: string;
	/** Model identifier */
	model: string;
	/** Model format (qwen, deepseek) */
	format: ModelFormat;
	/** Maximum lines to generate */
	maxLines: number;
	/** Maximum tokens to generate */
	maxTokens: number;
	/** Sampling temperature */
	temperature: number;
	/** Backend type (auto-detected if not specified) */
	backendType?: BackendType;
}

/**
 * Completion service for managing AI completions
 *
 * Integrates:
 * - Backend abstraction (Ollama, vLLM, llama.cpp)
 * - Semantic caching for repeated completions
 * - Session management for document context
 * - Scope detection for smart line limits
 */
export class CompletionService {
	private backend: IInferenceBackend | null = null;
	private currentEndpoint: string = '';
	private currentBackendType: BackendType | null = null;

	private readonly cache: SemanticCache<string>;
	private readonly sessionManager: SessionManager;
	private readonly scopeDetector: ScopeDetector;

	constructor() {
		this.cache = new SemanticCache<string>({
			maxSize: 100,
			ttlMs: 5 * 60 * 1000, // 5 minutes
			enableNormalization: true,
		});
		this.sessionManager = new SessionManager({
			sessionTtlMs: 5 * 60 * 1000,
			maxSessions: 10,
		});
		this.scopeDetector = new ScopeDetector();
	}

	/**
	 * Run AI completion
	 *
	 * @param prefix Code before cursor
	 * @param suffix Code after cursor
	 * @param config Completion configuration
	 * @param filePath Optional file path for session tracking
	 * @param canceled Cancellation check function
	 * @returns Generated completion text
	 */
	async complete(
		prefix: string,
		suffix: string,
		config: CompletionConfig,
		filePath?: string,
		canceled?: () => boolean
	): Promise<string> {
		// Check cache first
		const cacheKey = {
			prefix,
			suffix,
			filePath,
			model: config.model,
		};

		const cached = this.cache.get(cacheKey);
		if (cached !== undefined) {
			info('Cache hit - returning cached completion');
			return cached;
		}

		// Update session if file path provided
		if (filePath) {
			this.sessionManager.updateContext(filePath, prefix, suffix);
		}

		// Get or create backend
		const backend = this.getBackend(config);

		// Determine effective max lines based on scope
		const scope = this.scopeDetector.detect(prefix, suffix);
		const recommendedMaxLines = this.scopeDetector.getRecommendedMaxLines(prefix);
		const effectiveMaxLines = Math.min(config.maxLines, recommendedMaxLines);

		info(`Scope: type=${scope.type}, depth=${scope.depth}, maxLines=${effectiveMaxLines}`);

		// Build completion request
		const { prompt, stop } = adaptPrompt({
			prefix,
			suffix,
			format: config.format,
		});

		const request: CompletionRequest = {
			model: config.model,
			prefix,
			suffix,
			format: config.format,
			maxTokens: config.maxTokens,
			temperature: config.temperature,
			stop,
		};

		// Log request details
		info('=== Completion Request ===');
		info(`Model: ${config.model}, Format: ${config.format}`);
		info(`Prefix: ${prefix.length} chars, Suffix: ${suffix.length} chars`);
		info(`Max tokens: ${config.maxTokens}, Max lines: ${effectiveMaxLines}`);

		// Stream completion
		let result = '';
		let totalLines = 1;
		let blockStack: ('[' | '(' | '{')[] = [];
		let tokenCount = 0;

		try {
			outer: for await (const token of backend.streamCompletion(request)) {
				tokenCount++;

				if (canceled?.()) {
					info('Completion cancelled');
					break;
				}

				// Track bracket balance
				for (const c of token) {
					// Open brackets
					if (c === '[') {
						blockStack.push('[');
					}
					if (c === '(') {
						blockStack.push('(');
					}
					if (c === '{') {
						blockStack.push('{');
					}

					// Close brackets
					if (c === ']') {
						if (blockStack.length > 0 && blockStack[blockStack.length - 1] === '[') {
							blockStack.pop();
						} else {
							info('Block stack error (]), breaking');
							break outer;
						}
					}
					if (c === ')') {
						if (blockStack.length > 0 && blockStack[blockStack.length - 1] === '(') {
							blockStack.pop();
						} else {
							info('Block stack error ()), breaking');
							break outer;
						}
					}
					if (c === '}') {
						if (blockStack.length > 0 && blockStack[blockStack.length - 1] === '{') {
							blockStack.pop();
						} else {
							info('Block stack error (}), breaking');
							break outer;
						}
					}

					result += c;
				}

				// Count lines
				totalLines += countSymbol(token, '\n');

				// Break if too many lines and at top level
				if (totalLines > effectiveMaxLines && blockStack.length === 0) {
					info(`Max lines reached (${totalLines}), breaking`);
					break;
				}
			}
		} catch (error) {
			warn('Completion stream error:', error);
			throw error;
		}

		// Remove stop tokens from end
		for (const stopToken of stop) {
			if (result.endsWith(stopToken)) {
				result = result.slice(0, -stopToken.length);
				break;
			}
		}

		// Trim trailing whitespace from lines
		result = result
			.split('\n')
			.map((line) => line.trimEnd())
			.join('\n');

		// Log result
		info('=== Completion Result ===');
		info(`Tokens: ${tokenCount}, Lines: ${totalLines}, Length: ${result.length}`);
		info(`Result: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`);

		// Cache result
		if (result.trim()) {
			this.cache.set(cacheKey, result);
		}

		return result;
	}

	/**
	 * Check if model is available
	 */
	async checkModel(config: CompletionConfig): Promise<boolean> {
		const backend = this.getBackend(config);
		return backend.checkModel(config.model);
	}

	/**
	 * Download model (if supported)
	 */
	async downloadModel(
		config: CompletionConfig,
		onProgress?: (progress: number) => void
	): Promise<void> {
		const backend = this.getBackend(config);
		if (backend.downloadModel) {
			await backend.downloadModel(config.model, onProgress);
		} else {
			throw new Error('Backend does not support model download');
		}
	}

	/**
	 * Invalidate cache for a file
	 */
	invalidateCache(filePath: string): void {
		this.cache.invalidateFile(filePath);
	}

	/**
	 * End session for a file
	 */
	endSession(filePath: string): void {
		this.sessionManager.endSession(filePath);
		this.cache.invalidateFile(filePath);
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats() {
		return this.cache.getStats();
	}

	/**
	 * Get session statistics
	 */
	getSessionStats() {
		return this.sessionManager.getStats();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.backend?.dispose();
		this.backend = null;
		this.sessionManager.dispose();
		this.cache.clear();
		info('CompletionService disposed');
	}

	/**
	 * Get or create backend instance
	 */
	private getBackend(config: CompletionConfig): IInferenceBackend {
		const backendType = config.backendType ?? BackendFactory.detectBackendType(config.endpoint);

		// Reuse existing backend if config matches
		if (
			this.backend &&
			this.currentEndpoint === config.endpoint &&
			this.currentBackendType === backendType
		) {
			return this.backend;
		}

		// Dispose old backend
		this.backend?.dispose();

		// Create new backend
		this.backend = BackendFactory.create({
			type: backendType,
			endpoint: config.endpoint,
			bearerToken: config.bearerToken,
		});
		this.currentEndpoint = config.endpoint;
		this.currentBackendType = backendType;

		info(`Created ${backendType} backend for ${config.endpoint}`);

		return this.backend;
	}
}

// Singleton instance
let completionService: CompletionService | null = null;

/**
 * Get the completion service singleton
 */
export function getCompletionService(): CompletionService {
	if (!completionService) {
		completionService = new CompletionService();
	}
	return completionService;
}

/**
 * Dispose the completion service singleton
 */
export function disposeCompletionService(): void {
	completionService?.dispose();
	completionService = null;
}
