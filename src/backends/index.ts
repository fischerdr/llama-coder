/**
 * Inference Backend Module
 *
 * Provides unified interface for communicating with different inference servers:
 * - Ollama: Local model serving with download support
 * - vLLM: High-performance inference with OpenAI-compatible API
 * - llama.cpp: CPU-optimized inference
 */

// Core interface and types
export {
	IInferenceBackend,
	CompletionRequest,
	RewriteRequest,
	BackendCapabilities,
} from './IInferenceBackend';

// Backend implementations
export { OllamaBackend } from './OllamaBackend';
export { VLLMBackend } from './VLLMBackend';
export { LlamaCppBackend } from './LlamaCppBackend';

// Factory and utilities
export { BackendFactory, BackendType, BackendConfig } from './BackendFactory';
export { RetryPolicy, RetryConfig } from './RetryPolicy';
