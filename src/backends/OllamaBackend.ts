import {
	IInferenceBackend,
	CompletionRequest,
	RewriteRequest,
	BackendCapabilities,
} from './IInferenceBackend';
import { adaptPrompt } from '../prompts/processors/models';
import { info } from '../modules/log';

/**
 * Ollama response token format
 */
interface OllamaToken {
	model: string;
	response: string;
	done: boolean;
}

/**
 * Ollama backend implementation
 *
 * Provides integration with Ollama local inference server.
 * Supports model download, FIM completion, and instruction-following rewrites.
 */
export class OllamaBackend implements IInferenceBackend {
	constructor(
		private endpoint: string,
		private bearerToken: string
	) {
		// Normalize endpoint (remove trailing slash)
		this.endpoint = endpoint.replace(/\/$/, '');
	}

	async checkModel(modelName: string): Promise<boolean> {
		try {
			info(`Checking if model exists: ${modelName}`);

			const res = await fetch(`${this.endpoint}/api/tags`, {
				headers: this.bearerToken
					? { Authorization: `Bearer ${this.bearerToken}` }
					: {},
			});

			if (!res.ok) {
				info(`Model check failed: ${res.status} ${res.statusText}`);
				info(await res.text());
				return false;
			}

			const body = (await res.json()) as { models: { name: string }[] };
			const exists = body.models.some((m) => m.name === modelName);

			info(`Model ${modelName} exists: ${exists}`);
			return exists;
		} catch (error) {
			info(`Error checking model: ${error}`);
			return false;
		}
	}

	async downloadModel(
		modelName: string,
		onProgress?: (progress: number) => void
	): Promise<void> {
		info(`Downloading model from Ollama: ${modelName}`);

		for await (const line of this.lineGenerator(
			`${this.endpoint}/api/pull`,
			{ name: modelName }
		)) {
			info(`[DOWNLOAD] ${line}`);

			// Parse download progress if callback provided
			if (onProgress) {
				try {
					const data = JSON.parse(line) as {
						status?: string;
						completed?: number;
						total?: number;
					};
					if (data.completed && data.total) {
						const progress = data.completed / data.total;
						onProgress(progress);
					}
				} catch {
					// Ignore parse errors for progress
				}
			}
		}

		info(`Model download completed: ${modelName}`);
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

		// Build Ollama request
		const payload = {
			model: request.model,
			prompt,
			raw: true, // Don't apply chat template for FIM
			options: {
				stop,
				num_predict: request.maxTokens,
				temperature: request.temperature,
			},
		};

		info(`Streaming completion: model=${request.model}, format=${request.format}`);

		// Stream tokens
		let tokenCount = 0;
		for await (const line of this.lineGenerator(
			`${this.endpoint}/api/generate`,
			payload,
			request.signal
		)) {
			const token = this.parseToken(line);
			if (!token) {
				continue;
			}

			tokenCount++;
			if (tokenCount === 1 || tokenCount % 10 === 0 || token.done) {
				info(
					`Token #${tokenCount}: response="${token.response.replace(
						/\n/g,
						'\\n'
					)}", done=${token.done}`
				);
			}

			if (token.response) {
				yield token.response;
			}

			if (token.done) {
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

		// Build Ollama request (use chat mode for instruction-following)
		const payload = {
			model: request.model,
			prompt,
			raw: false, // Use chat template for better instruction-following
			options: {
				num_predict: request.maxTokens,
				temperature: request.temperature,
			},
		};

		info(`Streaming rewrite: model=${request.model}, format=${request.format}`);

		// Stream tokens
		let tokenCount = 0;
		for await (const line of this.lineGenerator(
			`${this.endpoint}/api/generate`,
			payload,
			request.signal
		)) {
			const token = this.parseToken(line);
			if (!token) {
				continue;
			}

			tokenCount++;
			if (tokenCount === 1 || tokenCount % 10 === 0 || token.done) {
				info(`Rewrite token #${tokenCount}: done=${token.done}`);
			}

			if (token.response) {
				yield token.response;
			}

			if (token.done) {
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
			supportsKVCache: false,
			supportsModelDownload: true,
			maxContextTokens: 32768, // Conservative default, model-dependent
			defaultModel: 'qwen2.5-coder:7b',
		};
	}

	dispose(): void {
		// No resources to cleanup for HTTP-based backend
		info('OllamaBackend disposed');
	}

	/**
	 * Parse Ollama JSON token
	 */
	private parseToken(line: string): OllamaToken | null {
		try {
			return JSON.parse(line) as OllamaToken;
		} catch (e) {
			console.warn(`Failed to parse JSON line: ${line}`);
			info(`Failed to parse JSON line: ${line}`);
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
	 * Generate lines from HTTP streaming response
	 * (Extracted from modules/lineGenerator.ts)
	 */
	private async *lineGenerator(
		url: string,
		data: any,
		signal?: AbortSignal
	): AsyncGenerator<string> {
		info('=== HTTP Request to Ollama ===');
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
