import * as vscode from 'vscode';
import { PromptProvider } from './prompts/provider';
import { info, registerLogger } from './modules/log';
import { disposeCompletionService } from './services/CompletionService';
import {
	RewriteActionProvider,
	getRewriteActionProvider,
	disposeRewriteActionProvider,
} from './prompts/RewriteActionProvider';
import { getDiffPreviewManager, disposeDiffPreviewManager } from './ui/DiffPreviewManager';

export function activate(context: vscode.ExtensionContext) {

	// Create logger
	registerLogger(vscode.window.createOutputChannel('Llama Coder', { log: true }));
	info('Llama Coder is activated.');

	// Create status bar
	context.subscriptions.push(vscode.commands.registerCommand('llama.openSettings', () => {
		vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ex3ndr.llama-coder');
	}));

	let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'llama.toggle';
	statusBarItem.text = `$(chip) Llama Coder`;
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// Create provider
	const provider = new PromptProvider(statusBarItem, context);
	let disposable = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**', }, provider);
	context.subscriptions.push(disposable);

	context.subscriptions.push(vscode.commands.registerCommand('llama.pause', () => {
		provider.paused = true;
	}));
	context.subscriptions.push(vscode.commands.registerCommand('llama.resume', () => {
		provider.paused = false;
	}));
	context.subscriptions.push(vscode.commands.registerCommand('llama.toggle', () => {
		provider.paused = !provider.paused;
	}));

	// Register rewrite action provider
	const rewriteProvider = getRewriteActionProvider();
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			{ pattern: '**' },
			rewriteProvider,
			{ providedCodeActionKinds: RewriteActionProvider.providedCodeActionKinds }
		)
	);

	// Register rewrite commands
	const diffPreviewManager = getDiffPreviewManager();

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'llama.rewrite',
			(document: vscode.TextDocument, range: vscode.Range, instruction: string) => {
				rewriteProvider.executeRewrite(document, range, instruction as any);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'llama.rewriteCustom',
			(document: vscode.TextDocument, range: vscode.Range) => {
				rewriteProvider.executeCustomRewrite(document, range);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('llama.acceptRewrite', () => {
			diffPreviewManager.acceptRewrite();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('llama.rejectRewrite', () => {
			diffPreviewManager.rejectRewrite();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('llama.showRewriteDiff', () => {
			diffPreviewManager.showDiff();
		})
	);

	info('Llama Coder rewrite commands registered.');
}

export function deactivate() {
	disposeCompletionService();
	disposeRewriteActionProvider();
	disposeDiffPreviewManager();
	info('Llama Coder deactivated.');
}
