import {
	IInferenceBackend,
	CompletionRequest,
	RewriteRequest,
	BackendCapabilities,
} from './IInferenceBackend';
import { adaptPrompt } from '../prompts/processors/models';
import { info } from '../modules/log';

/**
 * OpenAI-compatible chat completion delta format
 */
interface ChatCompletionDelta {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: {
		index: number;
		delta: {
			content?: string;
		};
		finish_reason: string | null;
	}[];
}

/**
 * vLLM backend implementation
 *
 * Provides integration with vLLM high-performance inference server.
 * Uses OpenAI-compatible API for chat completions.
 * Supports FIM completion and instruction-following rewrites.
 */
export class VLLMBackend implements IInferenceBackend {
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

			const res = await fetch(`${this.endpoint}/v1/models`, {
				headers: this.bearerToken
					? { Authorization: `Bearer ${this.bearerToken}` }
					: {},
			});

			if (!res.ok) {
				info(`Model check failed: ${res.status} ${res.statusText}`);
				info(await res.text());
				return false;
			}

			const body = (await res.json()) as { data: { id: string }[] };
			const exists = body.data.some((m) => m.id === modelName);

			info(`Model ${modelName} exists: ${exists}`);
			return exists;
		} catch (error) {
			info(`Error checking model: ${error}`);
			return false;
		}
	}

	async *streamCompletion(
		request: CompletionRequest
	): AsyncGenerator<string, void, unknown> {
		// Adapt prompt using model-specific FIM format
		const { prompt } = adaptPrompt({
			prefix: request.prefix,
			suffix: request.suffix,
			format: request.format,
		});

		// Build OpenAI-compatible request
		const payload = {
			model: request.model,
			messages: [
				{
					role: 'user',
					content: prompt,
				},
			],
			max_tokens: request.maxTokens,
			temperature: request.temperature,
			stop: request.stop,
			stream: true,
		};

		info(`Streaming completion: model=${request.model}, format=${request.format}`);

		// Stream tokens
		let tokenCount = 0;
		for await (const line of this.lineGenerator(
			`${this.endpoint}/v1/chat/completions`,
			payload,
			request.signal
		)) {
			const delta = this.parseDelta(line);
			if (!delta) {
				continue;
			}

			const content = delta.choices[0]?.delta?.content;
			const finishReason = delta.choices[0]?.finish_reason;

			tokenCount++;
			if (tokenCount === 1 || tokenCount % 10 === 0 || finishReason) {
				info(
					`Token #${tokenCount}: content="${content?.replace(
						/\n/g,
						'\\n'
					)}", finish_reason=${finishReason}`
				);
			}

			if (content) {
				yield content;
			}

			if (finishReason) {
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

		// Build OpenAI-compatible request
		const payload = {
			model: request.model,
			messages: [
				{
					role: 'system',
					content: 'You are a code rewriting assistant. Follow instructions precisely and return only the requested format.',
				},
				{
					role: 'user',
					content: prompt,
				},
			],
			max_tokens: request.maxTokens,
			temperature: request.temperature,
			stream: true,
		};

		info(`Streaming rewrite: model=${request.model}, format=${request.format}`);

		// Stream tokens
		let tokenCount = 0;
		for await (const line of this.lineGenerator(
			`${this.endpoint}/v1/chat/completions`,
			payload,
			request.signal
		)) {
			const delta = this.parseDelta(line);
			if (!delta) {
				continue;
			}

			const content = delta.choices[0]?.delta?.content;
			const finishReason = delta.choices[0]?.finish_reason;

			tokenCount++;
			if (tokenCount === 1 || tokenCount % 10 === 0 || finishReason) {
				info(`Rewrite token #${tokenCount}: finish_reason=${finishReason}`);
			}

			if (content) {
				yield content;
			}

			if (finishReason) {
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
			supportsKVCache: true, // vLLM supports prefix caching
			supportsModelDownload: false,
			maxContextTokens: 32768, // Conservative default, model-dependent
			defaultModel: 'Qwen/Qwen2.5-Coder-7B-Instruct',
		};
	}

	dispose(): void {
		// No resources to cleanup for HTTP-based backend
		info('VLLMBackend disposed');
	}

	/**
	 * Parse OpenAI chat completion delta (Server-Sent Events format)
	 */
	private parseDelta(line: string): ChatCompletionDelta | null {
		// SSE format: "data: {json}"
		if (!line.startsWith('data: ')) {
			return null;
		}

		const data = line.slice(6);

		// Skip [DONE] marker
		if (data === '[DONE]') {
			return null;
		}

		try {
			return JSON.parse(data) as ChatCompletionDelta;
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
		info('=== HTTP Request to vLLM ===');
		info(`URL: ${url}`);
		info(`Method: POST`);
		info(`Has Bearer Token: ${!!this.bearerToken}`);
		info(
			`Request body: ${JSON.stringify(
				{
					...data,
					messages: data.messages
						? `[${data.messages.length} messages]`
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
