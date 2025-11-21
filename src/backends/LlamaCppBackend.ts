import {
	IInferenceBackend,
	CompletionRequest,
	RewriteRequest,
	BackendCapabilities,
} from './IInferenceBackend';
import { adaptPrompt } from '../prompts/processors/models';
import { info } from '../modules/log';

/**
 * llama.cpp completion response format
 */
interface LlamaCppCompletion {
	content: string;
	stop: boolean;
}

/**
 * llama.cpp backend implementation
 *
 * Provides integration with llama.cpp inference server.
 * Uses /completion endpoint for streaming text generation.
 * Optimized for CPU inference with quantized models.
 */
export class LlamaCppBackend implements IInferenceBackend {
	constructor(
		private endpoint: string,
		private bearerToken: string
	) {
		// Normalize endpoint (remove trailing slash)
		this.endpoint = endpoint.replace(/\/$/, '');
	}

	async checkModel(modelName: string): Promise<boolean> {
		try {
			info(`Checking llama.cpp server availability`);

			// llama.cpp doesn't have a models endpoint, so check health instead
			const res = await fetch(`${this.endpoint}/health`, {
				headers: this.bearerToken
					? { Authorization: `Bearer ${this.bearerToken}` }
					: {},
			});

			if (!res.ok) {
				info(`Health check failed: ${res.status} ${res.statusText}`);
				return false;
			}

			const body = (await res.json()) as { status: string };
			const healthy = body.status === 'ok';

			info(`llama.cpp server healthy: ${healthy}`);
			return healthy;
		} catch (error) {
			info(`Error checking llama.cpp server: ${error}`);
			return false;
		}
	}

	async *streamCompletion(
		request: CompletionRequest
	): AsyncGenerator<string, void, unknown> {
		// Adapt prompt using model-specific FIM format
		const { prompt, stop } = adaptPrompt({
			prefix: request.prefix,
			suffix: request.suffix,
			format: request.format,
		});

		// Build llama.cpp request
		const payload = {
			prompt,
			n_predict: request.maxTokens,
			temperature: request.temperature,
			stop: [...stop, ...request.stop],
			stream: true,
		};

		info(`Streaming completion: model=${request.model}, format=${request.format}`);

		// Stream tokens
		let tokenCount = 0;
		for await (const line of this.lineGenerator(
			`${this.endpoint}/completion`,
			payload,
			request.signal
		)) {
			const completion = this.parseCompletion(line);
			if (!completion) {
				continue;
			}

			tokenCount++;
			if (tokenCount === 1 || tokenCount % 10 === 0 || completion.stop) {
				info(
					`Token #${tokenCount}: content="${completion.content?.replace(
						/\n/g,
						'\\n'
					)}", stop=${completion.stop}`
				);
			}

			if (completion.content) {
				yield completion.content;
			}

			if (completion.stop) {
				info(`Completion stream ended. Total tokens: ${tokenCount}`);
				break;
			}

			// Check cancellation
			if (request.signal?.aborted) {
				info('Completion cancelled by signal');
				break;
			}
		}
	}

	async *streamRewrite(
		request: RewriteRequest
	): AsyncGenerator<string, void, unknown> {
		// Build instruction prompt
		const prompt = this.buildRewritePrompt(request);

		// Build llama.cpp request
		const payload = {
			prompt,
			n_predict: request.maxTokens,
			temperature: request.temperature,
			stream: true,
		};

		info(`Streaming rewrite: model=${request.model}, format=${request.format}`);

		// Stream tokens
		let tokenCount = 0;
		for await (const line of this.lineGenerator(
			`${this.endpoint}/completion`,
			payload,
			request.signal
		)) {
			const completion = this.parseCompletion(line);
			if (!completion) {
				continue;
			}

			tokenCount++;
			if (tokenCount === 1 || tokenCount % 10 === 0 || completion.stop) {
				info(`Rewrite token #${tokenCount}: stop=${completion.stop}`);
			}

			if (completion.content) {
				yield completion.content;
			}

			if (completion.stop) {
				info(`Rewrite stream ended. Total tokens: ${tokenCount}`);
				break;
			}

			// Check cancellation
			if (request.signal?.aborted) {
				info('Rewrite cancelled by signal');
				break;
			}
		}
	}

	getCapabilities(): BackendCapabilities {
		return {
			supportsFIM: true,
			supportsStreaming: true,
			supportsKVCache: false, // llama.cpp has limited KV cache support
			supportsModelDownload: false,
			maxContextTokens: 8192, // Conservative default for CPU inference
			defaultModel: 'local-model', // User provides their own model file
		};
	}

	dispose(): void {
		// No resources to cleanup for HTTP-based backend
		info('LlamaCppBackend disposed');
	}

	/**
	 * Parse llama.cpp completion response (Server-Sent Events format)
	 */
	private parseCompletion(line: string): LlamaCppCompletion | null {
		// SSE format: "data: {json}"
		if (!line.startsWith('data: ')) {
			return null;
		}

		const data = line.slice(6);

		try {
			return JSON.parse(data) as LlamaCppCompletion;
		} catch (e) {
			console.warn(`Failed to parse SSE line: ${line}`);
			info(`Failed to parse SSE line: ${line}`);
			return null;
		}
	}

	/**
	 * Build instruction prompt for rewrite operation
	 */
	private buildRewritePrompt(request: RewriteRequest): string {
		if (request.format === 'json') {
			return `You are a code rewriting assistant. Given a code snippet and an instruction, rewrite the code according to the instruction.

Context:
\`\`\`
${request.context}
\`\`\`

Original code:
\`\`\`
${request.selectedText}
\`\`\`

Instruction: ${request.instruction}

Respond with JSON in this exact format:
{
  "rewritten": "<the rewritten code>",
  "changes": ["<description of change 1>", "<description of change 2>"]
}`;
		} else {
			// Tagged format
			return `You are a code rewriting assistant. Given a code snippet and an instruction, rewrite the code according to the instruction.

Context:
\`\`\`
${request.context}
\`\`\`

Original code:
\`\`\`
${request.selectedText}
\`\`\`

Instruction: ${request.instruction}

Respond in this exact format:
<REWRITTEN>
<the rewritten code>
</REWRITTEN>
<CHANGES>
- <description of change 1>
- <description of change 2>
</CHANGES>`;
		}
	}

	/**
	 * Generate lines from HTTP streaming response (Server-Sent Events)
	 */
	private async *lineGenerator(
		url: string,
		data: any,
		signal?: AbortSignal
	): AsyncGenerator<string> {
		info('=== HTTP Request to llama.cpp ===');
		info(`URL: ${url}`);
		info(`Method: POST`);
		info(`Has Bearer Token: ${!!this.bearerToken}`);
		info(
			`Request body: ${JSON.stringify(
				{
					...data,
					prompt: data.prompt
						? `[${data.prompt.length} chars]`
						: undefined,
				},
				null,
				2
			)}`
		);

		const controller = new AbortController();

		// Link external signal to internal controller
		if (signal) {
			signal.addEventListener('abort', () => controller.abort());
		}

		let res: Response;
		try {
			res = await fetch(url, {
				method: 'POST',
				body: JSON.stringify(data),
				headers: this.bearerToken
					? {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${this.bearerToken}`,
					  }
					: {
							'Content-Type': 'application/json',
					  },
				signal: controller.signal,
			});
		} catch (error) {
			info(`Fetch error: ${error}`);
			throw new Error(`Unable to connect to backend: ${error}`);
		}

		info(`Response status: ${res.status} ${res.statusText}`);

		if (!res.ok || !res.body) {
			const text = await res.text();
			info(`ERROR: ${text}`);
			throw new Error(`HTTP ${res.status}: ${text}`);
		}

		info('Starting to read response stream...');

		const stream = res.body.getReader();
		const decoder = new TextDecoder();
		let pending = '';
		let chunkCount = 0;
		let totalBytes = 0;

		try {
			while (true) {
				const { done, value } = await stream.read();

				if (done) {
					info(
						`Stream ended. Total chunks: ${chunkCount}, Total bytes: ${totalBytes}`
					);
					if (pending.length > 0) {
						yield pending;
					}
					break;
				}

				const chunk = decoder.decode(value);
				chunkCount++;
				totalBytes += value.length;

				if (chunkCount <= 3) {
					info(
						`Chunk #${chunkCount} (${value.length} bytes): ${chunk.substring(
							0,
							100
						)}...`
					);
				}

				pending += chunk;

				while (pending.indexOf('\n') >= 0) {
					const offset = pending.indexOf('\n');
					yield pending.slice(0, offset);
					pending = pending.slice(offset + 1);
				}

				// Check cancellation
				if (signal?.aborted) {
					info('Stream cancelled by signal');
					break;
				}
			}
		} finally {
			stream.releaseLock();
			if (!stream.closed) {
				await stream.cancel();
				info('Stream cancelled by client');
			}
			controller.abort();
		}
	}
}
