import vscode from 'vscode';
import { info, warn } from '../modules/log';
import { preparePrompt } from './preparePrompt';
import { AsyncLock } from '../modules/lock';
import { isNotNeeded, isSupported } from './filter';
import { config } from '../config';
import {
	getCompletionService,
	CompletionConfig,
} from '../services/CompletionService';
import { getReplacementAnalyzer } from './ReplacementAnalyzer';
import { detectLanguage } from './processors/detectLanguage';
import { InlineDecorationManager } from '../ui/InlineDecorationManager';

type Status = {
    icon: string;
    text: string;
};

export class PromptProvider implements vscode.InlineCompletionItemProvider {

    lock = new AsyncLock();
    statusbar: vscode.StatusBarItem;
    context: vscode.ExtensionContext;
    private _paused: boolean = false;
    private _status: Status = { icon: "chip", text: "Llama Coder" };
    private decorationManager: InlineDecorationManager;

    constructor(statusbar: vscode.StatusBarItem, context: vscode.ExtensionContext) {
        this.statusbar = statusbar;
        this.context = context;
        this.decorationManager = new InlineDecorationManager();
    }
    
    public set paused(value: boolean) {
        this._paused = value;
        this.update();
    }

    public get paused(): boolean {
        return this._paused;
    }

    private update(icon?: string, text?: string): void {
        this._status.icon = icon ? icon : this._status.icon;
        this._status.text = text ? text : this._status.text;

        let statusText = '';
        let statusTooltip = '';
        if (this._paused) {
            statusText = `$(sync-ignored) ${this._status.text}`;
            statusTooltip = `${this._status.text} (Paused)`;
        } else {
            statusText = `$(${this._status.icon}) ${this._status.text}`;
            statusTooltip = `${this._status.text}`;
        }
        this.statusbar.text = statusText;
        this.statusbar.tooltip = statusTooltip;
    }

    async delayCompletion(delay: number, token: vscode.CancellationToken): Promise<boolean> {
        if (config.inference.delay < 0) {
            return false;
        }
        await new Promise(p => setTimeout(p, delay));
        if (token.isCancellationRequested) {
            return false;
        }
        return true;
    }

    async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined | null> {
        if (!await this.delayCompletion(config.inference.delay, token)) {
            return;
        }

        try {
            if (this.paused) {
                return;
            }

            // Ignore unsupported documents
            if (!isSupported(document)) {
                info(`Unsupported document: ${document.uri.toString()} ignored.`);
                return;
            }

            // Ignore if not needed
            if (isNotNeeded(document, position, context)) {
                info('No inline completion required');
                return;
            }

            // Ignore if already canceled
            if (token.isCancellationRequested) {
                info(`Canceled before AI completion.`);
                return;
            }

            // Execute in lock
            return await this.lock.inLock(async () => {

                // Prepare context
                let prepared = await preparePrompt(document, position, context);
                if (token.isCancellationRequested) {
                    info(`Canceled before AI completion.`);
                    return;
                }

                // Get completion service and config
                const completionService = getCompletionService();
                const inferenceConfig = config.inference;
                const filePath = document.uri.fsPath;

                info(`Using model: ${inferenceConfig.modelName} (format: ${inferenceConfig.modelFormat})`);

                // Build completion config
                const completionConfig: CompletionConfig = {
                    endpoint: inferenceConfig.endpoint,
                    bearerToken: inferenceConfig.bearerToken,
                    model: inferenceConfig.modelName,
                    format: inferenceConfig.modelFormat,
                    maxLines: inferenceConfig.maxLines,
                    maxTokens: inferenceConfig.maxTokens,
                    temperature: inferenceConfig.temperature,
                };

                // Check model exists (for Ollama backend)
                this.update('sync~spin', 'Llama Coder');
                let res: string | null = null;

                try {
                    const modelExists = await completionService.checkModel(completionConfig);
                    if (token.isCancellationRequested) {
                        info(`Canceled after model check.`);
                        return;
                    }

                    // Download model if not exists (Ollama only)
                    if (!modelExists) {
                        // Check if user asked to ignore download
                        if (this.context.globalState.get('llama-coder-download-ignored') === inferenceConfig.modelName) {
                            info(`Ignoring since user asked to ignore download.`);
                            return;
                        }

                        // Ask for download
                        const download = await vscode.window.showInformationMessage(
                            `Model ${inferenceConfig.modelName} is not downloaded. Do you want to download it? Answering "No" would require you to manually download model.`,
                            'Yes',
                            'No'
                        );
                        if (download === 'No') {
                            info(`Ignoring since user asked to ignore download.`);
                            this.context.globalState.update('llama-coder-download-ignored', inferenceConfig.modelName);
                            return;
                        }

                        // Perform download
                        this.update('sync~spin', 'Downloading');
                        await completionService.downloadModel(completionConfig);
                        this.update('sync~spin', 'Llama Coder');
                    }

                    if (token.isCancellationRequested) {
                        info(`Canceled after model download.`);
                        return;
                    }

                    // Run AI completion (includes caching, session management, scope detection)
                    info(`Running AI completion...`);
                    res = await completionService.complete(
                        prepared.prefix,
                        prepared.suffix,
                        completionConfig,
                        filePath,
                        () => token.isCancellationRequested
                    );
                    info(`AI completion completed: ${res}`);
                } finally {
                    this.update('chip', 'Llama Coder');
                }
                if (token.isCancellationRequested) {
                    info(`Canceled after AI completion.`);
                    return;
                }

                // Return result
                if (res && res.trim() !== '') {
                    try {
                        // Use ReplacementAnalyzer for smart replacement
                        const replacementAnalyzer = getReplacementAnalyzer();
                        const completionConfig = config.completion;

                        const analysis = replacementAnalyzer.analyze({
                            document,
                            position,
                            prefix: prepared.prefix,
                            suffix: prepared.suffix,
                            completion: res,
                            language: detectLanguage(document.uri.fsPath, document.languageId),
                            enableReplacements: completionConfig.enableReplacements,
                        });

                        info(`Replacement decision: ${analysis.reason}`);
                        info(`  shouldReplace: ${analysis.shouldReplace}, confidence: ${analysis.confidence.toFixed(2)}`);
                        if (analysis.logicalUnitType) {
                            info(`  logicalUnitType: ${analysis.logicalUnitType}`);
                        }
                        if (analysis.replaceRange) {
                            info(`  range: L${analysis.replaceRange.start.line}-${analysis.replaceRange.end.line}`);
                        }
                        if (analysis.showVisualDiff) {
                            info(`  showVisualDiff: true (${analysis.replacedLines} lines)`);
                        }

                        // Check if we should show visual diff decorations
                        if (analysis.shouldReplace && analysis.showVisualDiff && analysis.replaceRange) {
                            // Show visual diff with decorations instead of returning InlineCompletionItem
                            info('Showing visual diff with decorations');

                            // Get active text editor
                            const activeEditor = vscode.window.activeTextEditor;
                            if (!activeEditor || activeEditor.document !== document) {
                                warn('Active editor does not match completion document');
                                // Fall back to standard completion
                                const replaceRange = analysis.replaceRange;
                                return [{
                                    insertText: analysis.insertText,
                                    range: replaceRange,
                                }];
                            }

                            // Clear any existing decorations first
                            if (this.decorationManager.hasPendingEdit()) {
                                this.decorationManager.clear(activeEditor);
                            }

                            // Show visual diff
                            this.decorationManager.showVisualDiff(
                                activeEditor,
                                analysis.replaceRange,
                                analysis.insertText
                            );

                            // Return empty array - decorations handle the visualization
                            return [];
                        }

                        // Standard completion with optional replacement range
                        const replaceRange = analysis.shouldReplace && analysis.replaceRange
                            ? analysis.replaceRange
                            : new vscode.Range(position, position);

                        return [{
                            insertText: analysis.insertText,
                            range: replaceRange,
                        }];
                    } catch (error) {
                        warn('ReplacementAnalyzer error, falling back to insert-only:', error);
                        // Fallback: insert-only mode
                        return [{
                            insertText: res,
                            range: new vscode.Range(position, position),
                        }];
                    }
                }

                // Nothing to complete
                return;
            });
        } catch (e) {
            warn('Error during inference:', e);
        }
    }
}