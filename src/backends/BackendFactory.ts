import { IInferenceBackend } from './IInferenceBackend';
import { OllamaBackend } from './OllamaBackend';
import { VLLMBackend } from './VLLMBackend';
import { LlamaCppBackend } from './LlamaCppBackend';
import { info } from '../modules/log';

/**
 * Backend type identifier
 */
export type BackendType = 'ollama' | 'vllm' | 'llamacpp';

/**
 * Configuration for backend instantiation
 */
export interface BackendConfig {
	/** Backend type to instantiate */
	type: BackendType;
	/** Server endpoint URL */
	endpoint: string;
	/** Optional bearer token for authentication */
	bearerToken?: string;
}

/**
 * Factory for creating inference backend instances
 *
 * Provides centralized backend instantiation with validation and
 * error handling. Supports auto-detection of backend type from endpoint.
 */
export class BackendFactory {
	/**
	 * Create a backend instance from configuration
	 *
	 * @param config Backend configuration
	 * @returns Initialized backend instance
	 * @throws Error if backend type is invalid or instantiation fails
	 */
	static create(config: BackendConfig): IInferenceBackend {
		info(
			`Creating ${config.type} backend: endpoint=${config.endpoint}, hasToken=${!!config.bearerToken}`
		);

		const endpoint = config.endpoint;
		const bearerToken = config.bearerToken || '';

		switch (config.type) {
			case 'ollama':
				return new OllamaBackend(endpoint, bearerToken);

			case 'vllm':
				return new VLLMBackend(endpoint, bearerToken);

			case 'llamacpp':
				return new LlamaCppBackend(endpoint, bearerToken);

			default:
				throw new Error(
					`Unknown backend type: ${config.type}. Supported types: ollama, vllm, llamacpp`
				);
		}
	}

	/**
	 * Auto-detect backend type from endpoint URL
	 *
	 * Uses common port conventions and endpoint patterns to guess
	 * the backend type. Falls back to 'ollama' if detection fails.
	 *
	 * Detection heuristics:
	 * - Port 11434 → ollama (default Ollama port)
	 * - Port 8000 → vllm (common vLLM port)
	 * - Port 8080 → llamacpp (common llama.cpp port)
	 * - /v1/* endpoints → vllm (OpenAI-compatible API)
	 * - /api/* endpoints → ollama (Ollama API)
	 * - /completion endpoint → llamacpp
	 *
	 * @param endpoint Server endpoint URL
	 * @returns Detected backend type
	 */
	static detectBackendType(endpoint: string): BackendType {
		try {
			const url = new URL(endpoint);

			// Check port-based detection
			if (url.port === '11434') {
				info('Detected ollama backend from port 11434');
				return 'ollama';
			}
			if (url.port === '8000') {
				info('Detected vllm backend from port 8000');
				return 'vllm';
			}
			if (url.port === '8080') {
				info('Detected llamacpp backend from port 8080');
				return 'llamacpp';
			}

			// Check path-based detection
			if (url.pathname.startsWith('/v1/')) {
				info('Detected vllm backend from /v1/* path');
				return 'vllm';
			}
			if (url.pathname.startsWith('/api/')) {
				info('Detected ollama backend from /api/* path');
				return 'ollama';
			}
			if (url.pathname === '/completion' || url.pathname === '/health') {
				info('Detected llamacpp backend from /completion or /health path');
				return 'llamacpp';
			}

			// Default to ollama (most common local setup)
			info('Could not detect backend type, defaulting to ollama');
			return 'ollama';
		} catch (error) {
			info(`Error parsing endpoint URL: ${error}, defaulting to ollama`);
			return 'ollama';
		}
	}

	/**
	 * Create a backend instance with auto-detection
	 *
	 * Convenience method that auto-detects the backend type from
	 * the endpoint URL and creates the appropriate backend instance.
	 *
	 * @param endpoint Server endpoint URL
	 * @param bearerToken Optional bearer token for authentication
	 * @returns Initialized backend instance
	 */
	static createAuto(
		endpoint: string,
		bearerToken?: string
	): IInferenceBackend {
		const type = this.detectBackendType(endpoint);
		return this.create({ type, endpoint, bearerToken });
	}

	/**
	 * Validate backend configuration
	 *
	 * Checks that the configuration is valid and the backend can be reached.
	 *
	 * @param config Backend configuration
	 * @param modelName Optional model name to check availability
	 * @returns True if valid and reachable, false otherwise
	 */
	static async validate(
		config: BackendConfig,
		modelName?: string
	): Promise<boolean> {
		try {
			const backend = this.create(config);

			// Check if backend is reachable
			if (modelName) {
				const available = await backend.checkModel(modelName);
				backend.dispose();
				return available;
			}

			// Just check if we can create the backend
			backend.dispose();
			return true;
		} catch (error) {
			info(`Backend validation failed: ${error}`);
			return false;
		}
	}
}
