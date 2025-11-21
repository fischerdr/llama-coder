import { ModelFormat } from '../prompts/processors/models';

/**
 * Request parameters for completion generation
 */
export interface CompletionRequest {
	/** Model identifier */
	model: string;
	/** Text before cursor position */
	prefix: string;
	/** Text after cursor position */
	suffix: string;
	/** Fill-In-Middle format (deepseek or qwen) */
	format: ModelFormat;
	/** Maximum tokens to generate */
	maxTokens: number;
	/** Sampling temperature (0.0-2.0) */
	temperature: number;
	/** Stop sequences */
	stop: string[];
	/** Optional request timeout in milliseconds */
	timeout?: number;
	/** Optional cancellation signal */
	signal?: AbortSignal;
}

/**
 * Request parameters for code rewrite operations
 */
export interface RewriteRequest {
	/** Model identifier */
	model: string;
	/** Selected text to rewrite */
	selectedText: string;
	/** User instruction for rewrite */
	instruction: string;
	/** Surrounding context */
	context: string;
	/** Maximum tokens to generate */
	maxTokens: number;
	/** Sampling temperature (0.0-2.0) */
	temperature: number;
	/** Output format preference */
	format: 'json' | 'tagged';
	/** Optional request timeout in milliseconds */
	timeout?: number;
	/** Optional cancellation signal */
	signal?: AbortSignal;
}

/**
 * Backend capabilities and constraints
 */
export interface BackendCapabilities {
	/** Supports Fill-In-Middle prompting */
	supportsFIM: boolean;
	/** Supports streaming responses */
	supportsStreaming: boolean;
	/** Supports KV cache for faster inference */
	supportsKVCache: boolean;
	/** Supports model download/management */
	supportsModelDownload: boolean;
	/** Maximum context window size in tokens */
	maxContextTokens: number;
	/** Default model identifier */
	defaultModel: string;
}

/**
 * Unified interface for inference backends
 *
 * Implementations provide integration with different inference servers:
 * - Ollama: Local model serving with download support
 * - vLLM: High-performance inference with OpenAI-compatible API
 * - llama.cpp: CPU-optimized inference
 */
export interface IInferenceBackend {
	/**
	 * Check if a model is available on the backend
	 * @param modelName Model identifier to check
	 * @returns True if model is available, false otherwise
	 */
	checkModel(modelName: string): Promise<boolean>;

	/**
	 * Download a model (if supported by backend)
	 * @param modelName Model identifier to download
	 * @param onProgress Optional progress callback (0.0-1.0)
	 */
	downloadModel?(modelName: string, onProgress?: (progress: number) => void): Promise<void>;

	/**
	 * Generate code completion using Fill-In-Middle prompting
	 * @param request Completion parameters
	 * @yields Token strings as they are generated
	 */
	streamCompletion(request: CompletionRequest): AsyncGenerator<string, void, unknown>;

	/**
	 * Generate code rewrite based on instruction
	 * @param request Rewrite parameters
	 * @yields Token strings as they are generated
	 */
	streamRewrite(request: RewriteRequest): AsyncGenerator<string, void, unknown>;

	/**
	 * Get backend capabilities and constraints
	 * @returns Backend capability information
	 */
	getCapabilities(): BackendCapabilities;

	/**
	 * Cleanup resources (connections, timers, etc.)
	 */
	dispose(): void;
}
