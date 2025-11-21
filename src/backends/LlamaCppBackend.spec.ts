import { LlamaCppBackend } from './LlamaCppBackend';
import { CompletionRequest, RewriteRequest } from './IInferenceBackend';

// Mock fetch globally
global.fetch = jest.fn();

describe('LlamaCppBackend', () => {
	let backend: LlamaCppBackend;
	const endpoint = 'http://localhost:8080';
	const bearerToken = '';

	beforeEach(() => {
		backend = new LlamaCppBackend(endpoint, bearerToken);
		jest.clearAllMocks();
	});

	afterEach(() => {
		backend.dispose();
	});

	describe('constructor', () => {
		it('should normalize endpoint by removing trailing slash', () => {
			const backendWithSlash = new LlamaCppBackend('http://localhost:8080/', '');
			expect((backendWithSlash as any).endpoint).toBe('http://localhost:8080');
			backendWithSlash.dispose();
		});

		it('should preserve endpoint without trailing slash', () => {
			expect((backend as any).endpoint).toBe('http://localhost:8080');
		});
	});

	describe('checkModel', () => {
		it('should return true when server is healthy', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					status: 'ok',
				}),
			});

			const exists = await backend.checkModel('local-model');
			expect(exists).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:8080/health',
				{ headers: {} }
			);
		});

		it('should return false when server returns non-ok status', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					status: 'error',
				}),
			});

			const exists = await backend.checkModel('local-model');
			expect(exists).toBe(false);
		});

		it('should return false when health check fails', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
			});

			const exists = await backend.checkModel('local-model');
			expect(exists).toBe(false);
		});

		it('should return false when network error occurs', async () => {
			(global.fetch as jest.Mock).mockRejectedValueOnce(
				new Error('Network error')
			);

			const exists = await backend.checkModel('local-model');
			expect(exists).toBe(false);
		});

		it('should include bearer token when provided', async () => {
			const backendWithToken = new LlamaCppBackend(endpoint, 'test-token');
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ status: 'ok' }),
			});

			await backendWithToken.checkModel('local-model');
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:8080/health',
				{ headers: { Authorization: 'Bearer test-token' } }
			);
			backendWithToken.dispose();
		});
	});

	describe('streamCompletion', () => {
		it('should stream completion tokens in SSE format', async () => {
			const mockStream = createMockStream([
				'data: {"content":"def ","stop":false}\n',
				'data: {"content":"hello","stop":false}\n',
				'data: {"content":"():\\n","stop":false}\n',
				'data: {"content":"    return","stop":false}\n',
				'data: {"content":"","stop":true}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'local-model',
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
				'http://localhost:8080/completion',
				expect.objectContaining({
					method: 'POST',
				})
			);
		});

		it('should handle cancellation via AbortSignal', async () => {
			const abortController = new AbortController();
			const mockStream = createMockStream([
				'data: {"content":"def ","stop":false}\n',
				'data: {"content":"hello","stop":false}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'local-model',
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
				'data: {"content":"valid","stop":false}\n',
				'invalid sse line\n',
				': comment line\n',
				'data: {"content":"token","stop":false}\n',
				'data: {"content":"","stop":true}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: CompletionRequest = {
				model: 'local-model',
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
				'data: {"content":"{\\"rewritten\\":","stop":false}\n',
				'data: {"content":"\\"updated code\\"","stop":false}\n',
				'data: {"content":"","stop":true}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: RewriteRequest = {
				model: 'local-model',
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
				'data: {"content":"<REWRITTEN>","stop":false}\n',
				'data: {"content":"new code","stop":false}\n',
				'data: {"content":"</REWRITTEN>","stop":false}\n',
				'data: {"content":"","stop":true}\n',
			]);

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			});

			const request: RewriteRequest = {
				model: 'local-model',
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
				supportsModelDownload: false,
				maxContextTokens: 8192,
				defaultModel: 'local-model',
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
