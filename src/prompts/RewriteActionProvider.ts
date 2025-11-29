/**
 * RewriteActionProvider - Provides "Rewrite with AI" code actions
 *
 * Implements CodeActionProvider to show rewrite options in the lightbulb menu
 * when code is selected. Integrates with the backend for AI-powered rewrites.
 */

import * as vscode from 'vscode';
import { info, warn } from '../modules/log';
import { config } from '../config';
import { BackendFactory } from '../backends/BackendFactory';
import { IInferenceBackend } from '../backends/IInferenceBackend';
import { PromptBuilder, RewriteInstruction, getPromptBuilder } from './PromptBuilder';
import { ResponseParser, getResponseParser } from './ResponseParser';
import { DiffPreviewManager, getDiffPreviewManager } from '../ui/DiffPreviewManager';
import { detectLanguage } from './processors/detectLanguage';
import { ModelFormat } from './processors/models';

/**
 * Rewrite code action kinds
 */
const REWRITE_ACTION_KIND = vscode.CodeActionKind.RefactorRewrite;

/**
 * RewriteActionProvider class
 */
export class RewriteActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		REWRITE_ACTION_KIND,
		vscode.CodeActionKind.QuickFix,
	];

	private backend: IInferenceBackend | null = null;
	private promptBuilder: PromptBuilder;
	private responseParser: ResponseParser;
	private diffPreviewManager: DiffPreviewManager;

	constructor() {
		this.promptBuilder = getPromptBuilder();
		this.responseParser = getResponseParser();
		this.diffPreviewManager = getDiffPreviewManager();
	}

	/**
	 * Provide code actions for the selected range
	 */
	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		_context: vscode.CodeActionContext,
		_token: vscode.CancellationToken
	): vscode.CodeAction[] | undefined {
		// Only provide actions for non-empty selections
		if (range.isEmpty) {
			return undefined;
		}

		const selectedText = document.getText(range);
		if (selectedText.trim().length < 5) {
			return undefined; // Too short to rewrite
		}

		const actions: vscode.CodeAction[] = [];

		// Add rewrite actions
		actions.push(this.createRewriteAction('Refactor', 'refactor', document, range));
		actions.push(this.createRewriteAction('Fix Issues', 'fix', document, range));
		actions.push(this.createRewriteAction('Add Documentation', 'document', document, range));
		actions.push(this.createRewriteAction('Optimize', 'optimize', document, range));
		actions.push(this.createRewriteAction('Simplify', 'simplify', document, range));
		actions.push(this.createCustomRewriteAction(document, range));

		return actions;
	}

	/**
	 * Create a rewrite code action
	 */
	private createRewriteAction(
		title: string,
		instruction: RewriteInstruction,
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection
	): vscode.CodeAction {
		const action = new vscode.CodeAction(
			`Llama: ${title}`,
			REWRITE_ACTION_KIND
		);
		action.command = {
			command: 'llama.rewrite',
			title: title,
			arguments: [document, range, instruction],
		};
		return action;
	}

	/**
	 * Create a custom rewrite action with user prompt
	 */
	private createCustomRewriteAction(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection
	): vscode.CodeAction {
		const action = new vscode.CodeAction(
			'Llama: Custom Rewrite...',
			REWRITE_ACTION_KIND
		);
		action.command = {
			command: 'llama.rewriteCustom',
			title: 'Custom Rewrite',
			arguments: [document, range],
		};
		return action;
	}

	/**
	 * Execute a rewrite operation
	 */
	async executeRewrite(
		document: vscode.TextDocument,
		range: vscode.Range,
		instruction: RewriteInstruction,
		customInstruction?: string
	): Promise<void> {
		const selectedCode = document.getText(range);
		const language = detectLanguage(document.uri.path, document.languageId) || document.languageId;
		const inferenceConfig = config.inference;

		info(`Executing rewrite: ${instruction} on ${selectedCode.length} chars of ${language}`);
		info(`Selected range: ${range.start.line}:${range.start.character} to ${range.end.line}:${range.end.character}`);
		info(`Selected code:\n${selectedCode}`);

		// Get context around the selection
		const contextBefore = this.getContextBefore(document, range, 500);
		const contextAfter = this.getContextAfter(document, range, 500);

		// Build prompt
		const prompt = this.promptBuilder.buildRewritePrompt({
			code: selectedCode,
			instruction,
			customInstruction,
			language,
			contextBefore,
			contextAfter,
			format: inferenceConfig.modelFormat as ModelFormat,
		});

		info(`Rewrite prompt: ${prompt.length} chars`);

		// Get or create backend
		await this.ensureBackend(inferenceConfig);
		if (!this.backend) {
			warn('No backend available for rewrite');
			vscode.window.showErrorMessage('Failed to connect to inference backend');
			return;
		}

		// Show progress
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Rewriting code...',
				cancellable: true,
			},
			async (progress, token) => {
				try {
					// For rewrites, we send a raw completion request directly to Ollama
					// without FIM formatting to avoid confusing the model
					let result = '';
					let tokenCount = 0;

					// Create abort controller for fetch cancellation
					const abortController = new AbortController();
					const cancelListener = token.onCancellationRequested(() => {
						abortController.abort();
					});

					// Stream from Ollama directly
					const response = await fetch(`${inferenceConfig.endpoint}/api/generate`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...(inferenceConfig.bearerToken
								? { Authorization: `Bearer ${inferenceConfig.bearerToken}` }
								: {}),
						},
						body: JSON.stringify({
							model: inferenceConfig.modelName,
							prompt,
							raw: true,
							stream: true,
							options: {
								num_predict: inferenceConfig.maxTokens * 3,
								temperature: 0.3,
								// Stop at closing code block
								stop: ['```\n\n', '```\n#'],
							},
						}),
						signal: abortController.signal,
					});

					cancelListener.dispose();

					if (!response.ok) {
						throw new Error(`HTTP ${response.status}: ${response.statusText}`);
					}

					const reader = response.body?.getReader();
					if (!reader) {
						throw new Error('No response body');
					}

					const decoder = new TextDecoder();
					let buffer = '';

					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}

						if (token.isCancellationRequested) {
							reader.cancel();
							info('Rewrite cancelled by user');
							return;
						}

						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split('\n');
						buffer = lines.pop() || '';

						for (const line of lines) {
							if (!line.trim()) {
								continue;
							}

							try {
								const json = JSON.parse(line);
								if (json.response) {
									result += json.response;
									tokenCount++;

									if (tokenCount % 10 === 0) {
										progress.report({ message: `${tokenCount} tokens...` });
									}
								}
								if (json.done) {
									break;
								}
							} catch (e) {
								// Skip invalid JSON lines
							}
						}
					}

					info(`Rewrite completed: ${result.length} chars, ${tokenCount} tokens`);

					// Parse the response
					const parsed = this.responseParser.parseRewriteResponse(result, selectedCode);

					if (!parsed.success || parsed.code.trim() === '') {
						warn(`Failed to parse rewrite response: ${parsed.error}`);
						vscode.window.showWarningMessage(
							`Rewrite failed: ${parsed.error || 'Empty response'}`
						);
						return;
					}

					info(`Parsed rewrite: ${parsed.code.length} chars, confidence: ${parsed.confidence}`);

					// Show diff preview
					await this.diffPreviewManager.showDiffPreview(
						document,
						range,
						selectedCode,
						parsed.code
					);
				} catch (error) {
					warn('Rewrite error:', error);
					vscode.window.showErrorMessage(
						`Rewrite failed: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}
			}
		);
	}

	/**
	 * Execute a custom rewrite with user-provided instruction
	 */
	async executeCustomRewrite(
		document: vscode.TextDocument,
		range: vscode.Range
	): Promise<void> {
		const instruction = await vscode.window.showInputBox({
			prompt: 'Enter rewrite instruction',
			placeHolder: 'e.g., "Convert to async/await", "Add error handling"',
		});

		if (!instruction) {
			return;
		}

		await this.executeRewrite(document, range, 'custom', instruction);
	}

	/**
	 * Get context before the selection
	 */
	private getContextBefore(
		document: vscode.TextDocument,
		range: vscode.Range,
		maxChars: number
	): string {
		const startOffset = document.offsetAt(range.start);
		const contextStart = Math.max(0, startOffset - maxChars);
		const contextRange = new vscode.Range(
			document.positionAt(contextStart),
			range.start
		);
		return document.getText(contextRange);
	}

	/**
	 * Get context after the selection
	 */
	private getContextAfter(
		document: vscode.TextDocument,
		range: vscode.Range,
		maxChars: number
	): string {
		const endOffset = document.offsetAt(range.end);
		const docLength = document.getText().length;
		const contextEnd = Math.min(docLength, endOffset + maxChars);
		const contextRange = new vscode.Range(
			range.end,
			document.positionAt(contextEnd)
		);
		return document.getText(contextRange);
	}

	/**
	 * Ensure backend is available
	 */
	private async ensureBackend(
		inferenceConfig: { endpoint: string; bearerToken?: string }
	): Promise<void> {
		if (!this.backend) {
			this.backend = BackendFactory.createAuto(
				inferenceConfig.endpoint,
				inferenceConfig.bearerToken
			);
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.backend = null;
	}
}

/**
 * Singleton instance
 */
let rewriteActionProviderInstance: RewriteActionProvider | null = null;

export function getRewriteActionProvider(): RewriteActionProvider {
	if (!rewriteActionProviderInstance) {
		rewriteActionProviderInstance = new RewriteActionProvider();
	}
	return rewriteActionProviderInstance;
}

export function disposeRewriteActionProvider(): void {
	if (rewriteActionProviderInstance) {
		rewriteActionProviderInstance.dispose();
		rewriteActionProviderInstance = null;
	}
}
