/**
 * DiffPreviewManager - Manages diff preview and accept/reject UI for code rewrites
 *
 * Provides visual diff display using VS Code's built-in diff editor
 * with overlay decorations and keyboard shortcuts for accept/reject.
 */

import * as vscode from 'vscode';
import { info } from '../modules/log';

/**
 * Pending rewrite that can be accepted or rejected
 */
interface PendingRewrite {
	/** Original document */
	document: vscode.TextDocument;
	/** Range of original code */
	range: vscode.Range;
	/** Original code */
	originalCode: string;
	/** Proposed new code */
	newCode: string;
	/** Decoration type for highlighting */
	decorationType: vscode.TextEditorDecorationType;
	/** Disposables for cleanup */
	disposables: vscode.Disposable[];
}

/**
 * DiffPreviewManager class
 */
export class DiffPreviewManager implements vscode.Disposable {
	private pendingRewrites: Map<string, PendingRewrite> = new Map();
	private statusBarItem: vscode.StatusBarItem;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			99
		);
	}

	/**
	 * Show a diff preview for a proposed rewrite
	 */
	async showDiffPreview(
		document: vscode.TextDocument,
		range: vscode.Range,
		originalCode: string,
		newCode: string
	): Promise<void> {
		const key = this.getDocumentKey(document);

		// Clean up any existing preview for this document
		await this.dismissPreview(document);

		info(`Showing diff preview: ${originalCode.length} -> ${newCode.length} chars`);

		// Create decoration types for showing the diff inline with strikethrough
		const deletionDecorationType = vscode.window.createTextEditorDecorationType({
			textDecoration: 'line-through',
			backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
			color: new vscode.ThemeColor('editorError.foreground'),
			isWholeLine: false,
			overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
			overviewRulerLane: vscode.OverviewRulerLane.Left,
		});

		const insertionDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
			color: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
			isWholeLine: false,
			overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
			overviewRulerLane: vscode.OverviewRulerLane.Left,
		});

		// Show inline diff in the editor
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document === document) {
			// Mark the original code with deletion decoration (strikethrough + red)
			const deletionDecoration: vscode.DecorationOptions = {
				range: range,
				hoverMessage: new vscode.MarkdownString(
					`**Original Code (will be deleted)**\n\n\`\`\`${document.languageId}\n${originalCode}\n\`\`\``
				),
			};
			editor.setDecorations(deletionDecorationType, [deletionDecoration]);

			// Show new code after the deleted section
			const insertionDecorations: vscode.DecorationOptions[] = [];
			const afterDecoration: vscode.DecorationOptions = {
				range: new vscode.Range(range.end, range.end),
				renderOptions: {
					after: {
						contentText: `\n${newCode}`,
						color: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
						backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
						fontStyle: 'normal',
					}
				},
				hoverMessage: new vscode.MarkdownString(
					`**New Code (will be inserted)**\n\n\`\`\`${document.languageId}\n${newCode}\n\`\`\``
				),
			};
			insertionDecorations.push(afterDecoration);

			editor.setDecorations(insertionDecorationType, insertionDecorations);
		}

		// Store pending rewrite
		const pending: PendingRewrite = {
			document,
			range,
			originalCode,
			newCode,
			decorationType: deletionDecorationType,
			disposables: [deletionDecorationType, insertionDecorationType],
		};

		this.pendingRewrites.set(key, pending);

		// Update status bar with instructions
		const linesDiff = newCode.split('\n').length - originalCode.split('\n').length;
		const diffText = linesDiff > 0 ? `+${linesDiff}` : linesDiff < 0 ? `${linesDiff}` : '±0';
		this.statusBarItem.text = `$(edit) Rewrite: ${originalCode.length}→${newCode.length} chars (${diffText} lines)`;
		this.statusBarItem.tooltip = 'Accept: Ctrl+Shift+Y | Reject: Ctrl+Shift+N | Close Diff: Click here';
		this.statusBarItem.command = 'llama.rejectRewrite';
		this.statusBarItem.show();

		// Automatically show the inline diff view
		await this.openInlineDiffView(document, range, originalCode, newCode);

		// Show persistent modal dialog for accept/reject
		const choice = await vscode.window.showInformationMessage(
			`Review the diff. Accept changes?`,
			{ modal: true },
			'Accept',
			'Reject'
		);

		if (choice === 'Accept') {
			await this.acceptRewrite(document);
		} else {
			await this.rejectRewrite(document);
		}
	}

	/**
	 * Show the diff view for the current pending rewrite
	 */
	async showDiff(document?: vscode.TextDocument): Promise<void> {
		const doc = document || vscode.window.activeTextEditor?.document;
		if (!doc) {
			return;
		}

		const key = this.getDocumentKey(doc);
		const pending = this.pendingRewrites.get(key);
		if (pending) {
			await this.openDiffView(doc, pending.range, pending.originalCode, pending.newCode);
		}
	}

	/**
	 * Open inline diff view
	 */
	private async openInlineDiffView(
		document: vscode.TextDocument,
		range: vscode.Range,
		originalCode: string,
		newCode: string
	): Promise<void> {
		// Use vscode.diff command with inline mode
		await this.openDiffView(document, range, originalCode, newCode);
	}

	/**
	 * Open VS Code's diff editor to show the changes
	 */
	private async openDiffView(
		document: vscode.TextDocument,
		_range: vscode.Range,
		originalCode: string,
		newCode: string
	): Promise<void> {
		// Create a virtual document for the original
		const originalUri = vscode.Uri.parse(
			`llama-rewrite-original:${document.uri.path}?original`
		);

		// Create a virtual document for the proposed change
		const proposedUri = vscode.Uri.parse(
			`llama-rewrite-proposed:${document.uri.path}?proposed`
		);

		// Register content providers for virtual documents
		const originalProvider = new (class implements vscode.TextDocumentContentProvider {
			provideTextDocumentContent(): string {
				return originalCode;
			}
		})();

		const proposedProvider = new (class implements vscode.TextDocumentContentProvider {
			provideTextDocumentContent(): string {
				return newCode;
			}
		})();

		const key = this.getDocumentKey(document);
		const pending = this.pendingRewrites.get(key);
		if (pending) {
			pending.disposables.push(
				vscode.workspace.registerTextDocumentContentProvider('llama-rewrite-original', originalProvider),
				vscode.workspace.registerTextDocumentContentProvider('llama-rewrite-proposed', proposedProvider)
			);
		}

		// Open diff editor
		const title = `Rewrite: ${document.fileName.split('/').pop()}`;
		await vscode.commands.executeCommand(
			'vscode.diff',
			originalUri,
			proposedUri,
			title,
			{ preview: true }
		);
	}

	/**
	 * Accept the pending rewrite for a document
	 */
	async acceptRewrite(document?: vscode.TextDocument): Promise<boolean> {
		const doc = document || vscode.window.activeTextEditor?.document;
		if (!doc) {
			return false;
		}

		const key = this.getDocumentKey(doc);
		const pending = this.pendingRewrites.get(key);

		if (!pending) {
			// Try to find any pending rewrite
			if (this.pendingRewrites.size === 1) {
				const firstEntry = this.pendingRewrites.entries().next().value;
				if (firstEntry) {
					const [firstKey, firstPending] = firstEntry;
					return this.applyRewrite(firstPending, firstKey);
				}
			}
			info('No pending rewrite to accept');
			return false;
		}

		return this.applyRewrite(pending, key);
	}

	/**
	 * Apply a rewrite to the document
	 */
	private async applyRewrite(pending: PendingRewrite, key: string): Promise<boolean> {
		info(`Accepting rewrite: replacing ${pending.originalCode.length} chars with ${pending.newCode.length} chars`);
		info(`Range: ${pending.range.start.line}:${pending.range.start.character} to ${pending.range.end.line}:${pending.range.end.character}`);
		info(`Original code:\n${pending.originalCode}`);
		info(`New code:\n${pending.newCode}`);

		// Find the editor for this document
		let editor = vscode.window.activeTextEditor;
		if (!editor || editor.document !== pending.document) {
			// Try to find the editor
			const editors = vscode.window.visibleTextEditors;
			editor = editors.find(e => e.document === pending.document);
		}

		if (!editor) {
			// Open the document
			const doc = await vscode.workspace.openTextDocument(pending.document.uri);
			editor = await vscode.window.showTextDocument(doc);
		}

		// Verify the range still contains the original code
		const currentText = editor.document.getText(pending.range);
		if (currentText !== pending.originalCode) {
			info(`Warning: Document changed. Original: ${pending.originalCode.length} chars, Current: ${currentText.length} chars`);
			vscode.window.showWarningMessage('Document has changed since rewrite was generated. Applying anyway...');
		}

		// Apply the edit - this will DELETE the text in the range and INSERT the new code
		const success = await editor.edit(editBuilder => {
			editBuilder.replace(pending.range, pending.newCode);
		});

		if (success) {
			info('Rewrite applied successfully');
			vscode.window.showInformationMessage('Rewrite applied');
		} else {
			info('Failed to apply rewrite');
			vscode.window.showErrorMessage('Failed to apply rewrite');
		}

		// Clean up
		await this.cleanup(key);

		return success;
	}

	/**
	 * Reject the pending rewrite for a document
	 */
	async rejectRewrite(document?: vscode.TextDocument): Promise<void> {
		const doc = document || vscode.window.activeTextEditor?.document;
		if (!doc) {
			// Try to reject any pending rewrite
			if (this.pendingRewrites.size > 0) {
				const firstKey = this.pendingRewrites.keys().next().value;
				if (firstKey) {
					await this.cleanup(firstKey);
					info('Rewrite rejected');
					vscode.window.showInformationMessage('Rewrite rejected');
				}
			}
			return;
		}

		const key = this.getDocumentKey(doc);
		if (this.pendingRewrites.has(key)) {
			await this.cleanup(key);
			info('Rewrite rejected');
			vscode.window.showInformationMessage('Rewrite rejected');
		}
	}

	/**
	 * Dismiss preview without accepting or rejecting
	 */
	async dismissPreview(document: vscode.TextDocument): Promise<void> {
		const key = this.getDocumentKey(document);
		await this.cleanup(key);
	}

	/**
	 * Check if there's a pending rewrite for a document
	 */
	hasPendingRewrite(document?: vscode.TextDocument): boolean {
		if (!document) {
			return this.pendingRewrites.size > 0;
		}
		const key = this.getDocumentKey(document);
		return this.pendingRewrites.has(key);
	}

	/**
	 * Get the pending rewrite for a document
	 */
	getPendingRewrite(document: vscode.TextDocument): { range: vscode.Range; newCode: string } | undefined {
		const key = this.getDocumentKey(document);
		const pending = this.pendingRewrites.get(key);
		if (pending) {
			return {
				range: pending.range,
				newCode: pending.newCode,
			};
		}
		return undefined;
	}

	/**
	 * Clean up a pending rewrite
	 */
	private async cleanup(key: string): Promise<void> {
		const pending = this.pendingRewrites.get(key);
		if (pending) {
			// Dispose decorations
			pending.decorationType.dispose();

			// Dispose content providers
			for (const disposable of pending.disposables) {
				disposable.dispose();
			}

			this.pendingRewrites.delete(key);
		}

		// Hide status bar if no more pending rewrites
		if (this.pendingRewrites.size === 0) {
			this.statusBarItem.hide();
		}

		// Close any diff editors showing llama-rewrite virtual documents
		const visibleEditors = vscode.window.visibleTextEditors;
		for (const editor of visibleEditors) {
			const uri = editor.document.uri.toString();
			if (uri.includes('llama-rewrite-original:') || uri.includes('llama-rewrite-proposed:')) {
				await vscode.window.showTextDocument(editor.document, { preview: false, preserveFocus: false });
				await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			}
		}
	}

	/**
	 * Get a unique key for a document
	 */
	private getDocumentKey(document: vscode.TextDocument): string {
		return document.uri.toString();
	}

	/**
	 * Dispose all resources
	 */
	dispose(): void {
		for (const [key] of this.pendingRewrites) {
			this.cleanup(key);
		}
		this.statusBarItem.dispose();
	}
}

/**
 * Singleton instance
 */
let diffPreviewManagerInstance: DiffPreviewManager | null = null;

export function getDiffPreviewManager(): DiffPreviewManager {
	if (!diffPreviewManagerInstance) {
		diffPreviewManagerInstance = new DiffPreviewManager();
	}
	return diffPreviewManagerInstance;
}

export function disposeDiffPreviewManager(): void {
	if (diffPreviewManagerInstance) {
		diffPreviewManagerInstance.dispose();
		diffPreviewManagerInstance = null;
	}
}
