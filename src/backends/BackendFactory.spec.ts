import { BackendFactory } from './BackendFactory';
import { OllamaBackend } from './OllamaBackend';
import { VLLMBackend } from './VLLMBackend';
import { LlamaCppBackend } from './LlamaCppBackend';

describe('BackendFactory', () => {
	describe('create', () => {
		it('should create Ollama backend', () => {
			const backend = BackendFactory.create({
				type: 'ollama',
				endpoint: 'http://localhost:11434',
			});

			expect(backend).toBeInstanceOf(OllamaBackend);
			backend.dispose();
		});

		it('should create vLLM backend', () => {
			const backend = BackendFactory.create({
				type: 'vllm',
				endpoint: 'http://localhost:8000',
			});

			expect(backend).toBeInstanceOf(VLLMBackend);
			backend.dispose();
		});

		it('should create llama.cpp backend', () => {
			const backend = BackendFactory.create({
				type: 'llamacpp',
				endpoint: 'http://localhost:8080',
			});

			expect(backend).toBeInstanceOf(LlamaCppBackend);
			backend.dispose();
		});

		it('should pass bearer token to backend', () => {
			const backend = BackendFactory.create({
				type: 'ollama',
				endpoint: 'http://localhost:11434',
				bearerToken: 'test-token',
			});

			expect(backend).toBeInstanceOf(OllamaBackend);
			expect((backend as any).bearerToken).toBe('test-token');
			backend.dispose();
		});

		it('should use empty string for bearer token if not provided', () => {
			const backend = BackendFactory.create({
				type: 'ollama',
				endpoint: 'http://localhost:11434',
			});

			expect((backend as any).bearerToken).toBe('');
			backend.dispose();
		});

		it('should throw error for unknown backend type', () => {
			expect(() => {
				BackendFactory.create({
					type: 'unknown' as any,
					endpoint: 'http://localhost:8000',
				});
			}).toThrow('Unknown backend type: unknown');
		});
	});

	describe('detectBackendType', () => {
		it('should detect ollama from port 11434', () => {
			const type = BackendFactory.detectBackendType(
				'http://localhost:11434'
			);
			expect(type).toBe('ollama');
		});

		it('should detect vllm from port 8000', () => {
			const type = BackendFactory.detectBackendType('http://localhost:8000');
			expect(type).toBe('vllm');
		});

		it('should detect llamacpp from port 8080', () => {
			const type = BackendFactory.detectBackendType('http://localhost:8080');
			expect(type).toBe('llamacpp');
		});

		it('should detect vllm from /v1/ path', () => {
			const type = BackendFactory.detectBackendType(
				'http://example.com/v1/chat/completions'
			);
			expect(type).toBe('vllm');
		});

		it('should detect ollama from /api/ path', () => {
			const type = BackendFactory.detectBackendType(
				'http://example.com/api/generate'
			);
			expect(type).toBe('ollama');
		});

		it('should detect llamacpp from /completion path', () => {
			const type = BackendFactory.detectBackendType(
				'http://example.com/completion'
			);
			expect(type).toBe('llamacpp');
		});

		it('should detect llamacpp from /health path', () => {
			const type = BackendFactory.detectBackendType(
				'http://example.com/health'
			);
			expect(type).toBe('llamacpp');
		});

		it('should default to ollama for unknown patterns', () => {
			const type = BackendFactory.detectBackendType(
				'http://localhost:9999'
			);
			expect(type).toBe('ollama');
		});

		it('should default to ollama for invalid URLs', () => {
			const type = BackendFactory.detectBackendType('not-a-url');
			expect(type).toBe('ollama');
		});
	});

	describe('createAuto', () => {
		it('should auto-detect and create ollama backend', () => {
			const backend = BackendFactory.createAuto('http://localhost:11434');

			expect(backend).toBeInstanceOf(OllamaBackend);
			backend.dispose();
		});

		it('should auto-detect and create vllm backend', () => {
			const backend = BackendFactory.createAuto('http://localhost:8000');

			expect(backend).toBeInstanceOf(VLLMBackend);
			backend.dispose();
		});

		it('should auto-detect and create llamacpp backend', () => {
			const backend = BackendFactory.createAuto('http://localhost:8080');

			expect(backend).toBeInstanceOf(LlamaCppBackend);
			backend.dispose();
		});

		it('should pass bearer token to auto-detected backend', () => {
			const backend = BackendFactory.createAuto(
				'http://localhost:11434',
				'test-token'
			);

			expect(backend).toBeInstanceOf(OllamaBackend);
			expect((backend as any).bearerToken).toBe('test-token');
			backend.dispose();
		});
	});

	describe('validate', () => {
		beforeEach(() => {
			global.fetch = jest.fn();
		});

		afterEach(() => {
			jest.clearAllMocks();
		});

		it('should return true for valid config without model check', async () => {
			const valid = await BackendFactory.validate({
				type: 'ollama',
				endpoint: 'http://localhost:11434',
			});

			expect(valid).toBe(true);
		});

		it('should return true when model is available', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					models: [{ name: 'qwen2.5-coder:7b' }],
				}),
			});

			const valid = await BackendFactory.validate(
				{
					type: 'ollama',
					endpoint: 'http://localhost:11434',
				},
				'qwen2.5-coder:7b'
			);

			expect(valid).toBe(true);
		});

		it('should return false when model is not available', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					models: [{ name: 'other-model' }],
				}),
			});

			const valid = await BackendFactory.validate(
				{
					type: 'ollama',
					endpoint: 'http://localhost:11434',
				},
				'qwen2.5-coder:7b'
			);

			expect(valid).toBe(false);
		});

		it('should return false for invalid backend type', async () => {
			const valid = await BackendFactory.validate({
				type: 'invalid' as any,
				endpoint: 'http://localhost:11434',
			});

			expect(valid).toBe(false);
		});

		it('should return false when model check throws error', async () => {
			(global.fetch as jest.Mock).mockRejectedValueOnce(
				new Error('Network error')
			);

			const valid = await BackendFactory.validate(
				{
					type: 'ollama',
					endpoint: 'http://localhost:11434',
				},
				'qwen2.5-coder:7b'
			);

			expect(valid).toBe(false);
		});
	});
});
