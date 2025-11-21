import { OllamaBackend } from './OllamaBackend';
import { CompletionRequest, RewriteRequest } from './IInferenceBackend';

// Mock fetch globally
global.fetch = jest.fn();

describe('OllamaBackend', () => {
	let backend: OllamaBackend;
	const endpoint = 'http://localhost:11434';
	const bearerToken = '';

	beforeEach(() => {
		backend = new OllamaBackend(endpoint, bearerToken);
		jest.clearAllMocks();
	});

	afterEach(() => {
		backend.dispose();
	});

	describe('constructor', () => {
		it('should normalize endpoint by removing trailing slash', () => {
			const backendWithSlash = new OllamaBackend('http://localhost:11434/', '');
			expect((backendWithSlash as any).endpoint).toBe('http://localhost:11434');
			backendWithSlash.dispose();
		});

		it('should preserve endpoint without trailing slash', () => {
			expect((backend as any).endpoint).toBe('http://localhost:11434');
		});
	});

	describe('checkModel', () => {
		it('should return true when model exists', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					models: [
						{ name: 'qwen2.5-coder:7b' },
						{ name: 'deepseek-coder:6.7b' },
					],
				}),
			});

			const exists = await backend.checkModel('qwen2.5-coder:7b');
			expect(exists).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:11434/api/tags',
				{ headers: {} }
			);
		});

		it('should return false when model does not exist', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					models: [{ name: 'qwen2.5-coder:7b' }],
				}),
			});

			const exists = await backend.checkModel('nonexistent:latest');
			expect(exists).toBe(false);
		});

		it('should return false when API request fails', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				text: async () => 'Error details',
			});

			const exists = await backend.checkModel('qwen2.5-coder:7b');
			expect(exists).toBe(false);
		});

		it('should return false when network error occurs', async () => {
			(global.fetch as jest.Mock).mockRejectedValueOnce(
				new Error('Network error')
			);

			const exists = await backend.checkModel('qwen2.5-coder:7b');
			expect(exists).toBe(false);
		});

		it('should include bearer token when provided', async () => {
			const backendWithToken = new OllamaBackend(endpoint, 'test-token');
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ models: [] }),
			});

			await backendWithToken.checkModel('qwen2.5-coder:7b');
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:11434/api/tags',
				{ headers: { Authorization: 'Bearer test-token' } }
			);
			backendWithToken.dispose();
		});
	});

	describe('downloadModel', () => {
		it('should download model with progress callback', async () => {
			const progressCallback = jest.fn();
			const mockStream = createMockStream([
				'{"status":"downloading","completed":50,"total":100}\n',
				'{"status":"downloading","completed":100,"total":100}\n',
				'{"status":"success"}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			await backend.downloadModel('qwen2.5-coder:7b', progressCallback);

			expect(progressCallback).toHaveBeenCalledWith(0.5);
			expect(progressCallback).toHaveBeenCalledWith(1.0);
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:11434/api/pull',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ name: 'qwen2.5-coder:7b' }),
				})
			);
		});

		it('should download model without progress callback', async () => {
			const mockStream = createMockStream([
				'{"status":"pulling manifest"}\n',
				'{"status":"success"}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			await backend.downloadModel('qwen2.5-coder:7b');
			expect(global.fetch).toHaveBeenCalled();
		});

		it('should throw error when download fails', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: 'Not Found',
				text: async () => 'Model not found',
			});

			await expect(
				backend.downloadModel('nonexistent:latest')
			).rejects.toThrow('HTTP 404: Model not found');
		});
	});

	describe('streamCompletion', () => {
		it('should stream completion tokens', async () => {
			const mockStream = createMockStream([
				'{"model":"qwen2.5-coder:7b","response":"def ","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"hello","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"():\\n","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"    return","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"","done":true}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'qwen2.5-coder:7b',
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

			expect(tokens).toEqual(['def ', 'hello', '():\n', '    return']);
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:11434/api/generate',
				expect.objectContaining({
					method: 'POST',
					body: expect.stringContaining('qwen2.5-coder:7b'),
				})
			);
		});

		it('should handle cancellation via AbortSignal', async () => {
			const abortController = new AbortController();
			const mockStream = createMockStream([
				'{"model":"qwen2.5-coder:7b","response":"def ","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"hello","done":false}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'qwen2.5-coder:7b',
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

		it('should skip invalid JSON lines', async () => {
			const mockStream = createMockStream([
				'{"model":"qwen2.5-coder:7b","response":"valid","done":false}\n',
				'invalid json line\n',
				'{"model":"qwen2.5-coder:7b","response":"token","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"","done":true}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'qwen2.5-coder:7b',
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
				'{"model":"qwen2.5-coder:7b","response":"{\\"rewritten\\":","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"\\"updated code\\"","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"","done":true}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: RewriteRequest = {
				model: 'qwen2.5-coder:7b',
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
				'{"model":"qwen2.5-coder:7b","response":"<REWRITTEN>","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"new code","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"</REWRITTEN>","done":false}\n',
				'{"model":"qwen2.5-coder:7b","response":"","done":true}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: RewriteRequest = {
				model: 'qwen2.5-coder:7b',
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
				supportsKVCache: false,
				supportsModelDownload: true,
				maxContextTokens: 32768,
				defaultModel: 'qwen2.5-coder:7b',
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
