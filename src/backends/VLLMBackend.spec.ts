import { VLLMBackend } from './VLLMBackend';
import { CompletionRequest, RewriteRequest } from './IInferenceBackend';

// Mock fetch globally
global.fetch = jest.fn();

describe('VLLMBackend', () => {
	let backend: VLLMBackend;
	const endpoint = 'http://localhost:8000';
	const bearerToken = '';

	beforeEach(() => {
		backend = new VLLMBackend(endpoint, bearerToken);
		jest.clearAllMocks();
	});

	afterEach(() => {
		backend.dispose();
	});

	describe('constructor', () => {
		it('should normalize endpoint by removing trailing slash', () => {
			const backendWithSlash = new VLLMBackend('http://localhost:8000/', '');
			expect((backendWithSlash as any).endpoint).toBe('http://localhost:8000');
			backendWithSlash.dispose();
		});

		it('should preserve endpoint without trailing slash', () => {
			expect((backend as any).endpoint).toBe('http://localhost:8000');
		});
	});

	describe('checkModel', () => {
		it('should return true when model exists', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: [
						{ id: 'Qwen/Qwen2.5-Coder-7B-Instruct' },
						{ id: 'deepseek-ai/deepseek-coder-6.7b-instruct' },
					],
				}),
			});

			const exists = await backend.checkModel('Qwen/Qwen2.5-Coder-7B-Instruct');
			expect(exists).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:8000/v1/models',
				{ headers: {} }
			);
		});

		it('should return false when model does not exist', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: [{ id: 'Qwen/Qwen2.5-Coder-7B-Instruct' }],
				}),
			});

			const exists = await backend.checkModel('nonexistent-model');
			expect(exists).toBe(false);
		});

		it('should return false when API request fails', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				text: async () => 'Error details',
			});

			const exists = await backend.checkModel('Qwen/Qwen2.5-Coder-7B-Instruct');
			expect(exists).toBe(false);
		});

		it('should return false when network error occurs', async () => {
			(global.fetch as jest.Mock).mockRejectedValueOnce(
				new Error('Network error')
			);

			const exists = await backend.checkModel('Qwen/Qwen2.5-Coder-7B-Instruct');
			expect(exists).toBe(false);
		});

		it('should include bearer token when provided', async () => {
			const backendWithToken = new VLLMBackend(endpoint, 'test-token');
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: [] }),
			});

			await backendWithToken.checkModel('Qwen/Qwen2.5-Coder-7B-Instruct');
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:8000/v1/models',
				{ headers: { Authorization: 'Bearer test-token' } }
			);
			backendWithToken.dispose();
		});
	});

	describe('streamCompletion', () => {
		it('should stream completion tokens in SSE format', async () => {
			const mockStream = createMockStream([
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"def "},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"():\\n"},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n',
				'data: [DONE]\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
				prefix: 'def hello',
				suffix: '\n\nprint(hello())',
				format: 'qwen',
				maxTokens: 100,
				temperature: 0.2,
				stop: ['<|fim_end|>'],
			};

			const tokens: string[] = [];
			for await (const token of backend.streamCompletion(request)) {
				tokens.push(token);
			}

			expect(tokens).toEqual(['def ', 'hello', '():\n']);
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:8000/v1/chat/completions',
				expect.objectContaining({
					method: 'POST',
					body: expect.stringContaining('Qwen/Qwen2.5-Coder-7B-Instruct'),
				})
			);
		});

		it('should handle cancellation via AbortSignal', async () => {
			const abortController = new AbortController();
			const mockStream = createMockStream([
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"def "},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
				prefix: 'def hello',
				suffix: '',
				format: 'qwen',
				maxTokens: 100,
				temperature: 0.2,
				stop: [],
				signal: abortController.signal,
			};

			const tokens: string[] = [];
			const generator = backend.streamCompletion(request);

			// Get first token
			const first = await generator.next();
			if (first.value) {
				tokens.push(first.value);
			}

			// Abort before next token
			abortController.abort();

			// Continue iteration - should stop
			for await (const token of generator) {
				tokens.push(token);
			}

			expect(tokens.length).toBeLessThanOrEqual(2);
		});

		it('should skip invalid SSE lines', async () => {
			const mockStream = createMockStream([
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"valid"},"finish_reason":null}]}\n',
				'invalid sse line\n',
				': comment line\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"token"},"finish_reason":null}]}\n',
				'data: [DONE]\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
				prefix: 'test',
				suffix: '',
				format: 'qwen',
				maxTokens: 100,
				temperature: 0.2,
				stop: [],
			};

			const tokens: string[] = [];
			for await (const token of backend.streamCompletion(request)) {
				tokens.push(token);
			}

			expect(tokens).toEqual(['valid', 'token']);
		});
	});

	describe('streamRewrite', () => {
		it('should stream rewrite tokens with JSON format', async () => {
			const mockStream = createMockStream([
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"{\\"rewritten\\":"},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"\\"updated code\\""},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n',
				'data: [DONE]\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: RewriteRequest = {
				model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
				selectedText: 'old code',
				instruction: 'Update to new style',
				context: 'function context',
				maxTokens: 500,
				temperature: 0.2,
				format: 'json',
			};

			const tokens: string[] = [];
			for await (const token of backend.streamRewrite(request)) {
				tokens.push(token);
			}

			expect(tokens).toEqual(['{"rewritten":', '"updated code"']);
		});

		it('should stream rewrite tokens with tagged format', async () => {
			const mockStream = createMockStream([
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"<REWRITTEN>"},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"new code"},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{"content":"</REWRITTEN>"},"finish_reason":null}]}\n',
				'data: {"id":"1","object":"chat.completion.chunk","created":1234,"model":"qwen","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n',
				'data: [DONE]\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: RewriteRequest = {
				model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
				selectedText: 'old code',
				instruction: 'Refactor',
				context: 'class context',
				maxTokens: 500,
				temperature: 0.2,
				format: 'tagged' as const,
			};

			const tokens: string[] = [];
			for await (const token of backend.streamRewrite(request)) {
				tokens.push(token);
			}

			expect(tokens).toEqual(['<REWRITTEN>', 'new code', '</REWRITTEN>']);
		});
	});

	describe('getCapabilities', () => {
		it('should return correct capabilities', () => {
			const capabilities = backend.getCapabilities();

			expect(capabilities).toEqual({
				supportsFIM: true,
				supportsStreaming: true,
				supportsKVCache: true, // vLLM supports prefix caching
				supportsModelDownload: false,
				maxContextTokens: 32768,
				defaultModel: 'Qwen/Qwen2.5-Coder-7B-Instruct',
			});
		});
	});

	describe('dispose', () => {
		it('should cleanup resources', () => {
			expect(() => backend.dispose()).not.toThrow();
		});
	});
});

/**
 * Create a mock ReadableStream for testing
 */
function createMockStream(lines: string[]): any {
	const encoder = new TextEncoder();
	let index = 0;

	return {
		getReader() {
			return {
				read: async () => {
					if (index < lines.length) {
						const value = encoder.encode(lines[index]);
						index++;
						return { done: false, value };
					}
					return { done: true, value: undefined };
				},
				releaseLock() {},
				closed: Promise.resolve(),
				cancel: async () => {},
			};
		},
	};
}
