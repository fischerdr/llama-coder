/**
 * InlineDecorationManager - Manages visual diff decorations for inline completions
 *
 * Provides Cursor-style inline visual diffs with:
 * - Red strikethrough on old code being replaced
 * - Green ghost text showing new code
 * - Keyboard handlers for accept (Tab) and reject (Escape)
 * - Auto-cleanup on document changes
 */

import * as vscode from 'vscode';

interface PendingEdit {
	editor: vscode.TextEditor;
	range: vscode.Range;
	newText: string;
}

export class InlineDecorationManager {
	private deletionDecoration: vscode.TextEditorDecorationType;
	private insertionDecoration: vscode.TextEditorDecorationType;
	private currentPendingEdit: PendingEdit | undefined;
	private keyboardDisposables: vscode.Disposable[] = [];
	private documentChangeDisposable: vscode.Disposable | undefined;
	private contextKey: string = 'llama-coder.inlineEditPending';

	constructor() {
		// Strikethrough decoration for deleted code
		this.deletionDecoration = vscode.window.createTextEditorDecorationType({
			textDecoration: 'line-through',
			backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
			color: new vscode.ThemeColor('editorError.foreground'),
			isWholeLine: false,
		});

		// Ghost text decoration for inserted code
		this.insertionDecoration = vscode.window.createTextEditorDecorationType({
			after: {
				color: new vscode.ThemeColor('editorGhostText.foreground'),
				fontStyle: 'italic',
			},
		});
	}

	/**
	 * Show visual diff with strikethrough and ghost text
	 *
	 * CRITICAL: Ghost text appears at END OF FIRST LINE, not at deleteRange.end
	 */
	showVisualDiff(
		editor: vscode.TextEditor,
		deleteRange: vscode.Range,
		insertText: string
	): void {
		// Clear any existing decorations first
		this.clear(editor);

		// Log what we're showing
		const document = editor.document;
		const deletedText = document.getText(deleteRange);
		const deletedLines = deleteRange.end.line - deleteRange.start.line + 1;

		console.log('=== VISUAL DIFF ===');
		console.log(`Delete range: L${deleteRange.start.line + 1}-L${deleteRange.end.line + 1} (${deletedLines} lines)`);
		console.log(`Deleted text (${deletedText.length} chars):`);
		console.log(deletedText.split('\n').map((line, i) => `  ${i + 1}: ${line}`).join('\n'));
		console.log(`\nGhost text (${insertText.length} chars):`);
		console.log(insertText.split('\n').map((line, i) => `  ${i + 1}: ${line}`).join('\n'));
		console.log('===================');

		// 1. Apply strikethrough to ENTIRE delete range (all lines)
		editor.setDecorations(this.deletionDecoration, [deleteRange]);

		// 2. CRITICAL: Ghost text must appear at END OF FIRST LINE
		//    NOT at deleteRange.end (would appear after last strikethrough)
		const firstLine = editor.document.lineAt(deleteRange.start.line);
		const firstLineEnd = firstLine.range.end; // End of first line content

		const insertDecoration: vscode.DecorationOptions = {
			range: new vscode.Range(firstLineEnd, firstLineEnd), // Position at line end
			renderOptions: {
				after: {
					contentText: insertText, // FULL replacement text
					color: new vscode.ThemeColor('editorGhostText.foreground'),
					fontStyle: 'italic',
					margin: '0 0 0 4px', // Small gap before ghost text
				},
			},
		};
		editor.setDecorations(this.insertionDecoration, [insertDecoration]);

		// 3. Store pending edit for keyboard handler
		this.currentPendingEdit = { editor, range: deleteRange, newText: insertText };

		// 4. Set context key for keyboard bindings
		vscode.commands.executeCommand('setContext', this.contextKey, true);

		// 5. Register keyboard handlers
		this.registerKeyboardHandlers(editor);

		// 6. Register document change listener for auto-cleanup
		this.registerDocumentChangeListener(editor);
	}

	/**
	 * Accept the pending edit: replace text and clear decorations
	 */
	async acceptEdit(): Promise<void> {
		if (!this.currentPendingEdit) {
			return;
		}

		const { editor, range, newText } = this.currentPendingEdit;

		// Validate cursor is still in the range
		const cursorPos = editor.selection.active;
		if (!range.contains(cursorPos) && !cursorPos.isEqual(range.end)) {
			// Cursor moved away, just clear decorations
			this.clear(editor);
			return;
		}

		// MUST replace the full range, not just first line
		await editor.edit((editBuilder) => {
			editBuilder.replace(range, newText); // Replaces ALL lines
		});

		// Clear ALL decorations
		this.clear(editor);
	}

	/**
	 * Reject the pending edit: clear decorations only
	 */
	rejectEdit(editor: vscode.TextEditor): void {
		this.clear(editor);
	}

	/**
	 * Clear all decorations and cleanup
	 */
	clear(editor: vscode.TextEditor): void {
		// Clear decorations
		editor.setDecorations(this.deletionDecoration, []);
		editor.setDecorations(this.insertionDecoration, []);

		// Clear pending edit
		this.currentPendingEdit = undefined;

		// Clear context key
		vscode.commands.executeCommand('setContext', this.contextKey, false);

		// Dispose keyboard handlers
		this.keyboardDisposables.forEach((d) => d.dispose());
		this.keyboardDisposables = [];

		// Dispose document change listener
		if (this.documentChangeDisposable) {
			this.documentChangeDisposable.dispose();
			this.documentChangeDisposable = undefined;
		}
	}

	/**
	 * Check if there's a pending edit
	 */
	hasPendingEdit(): boolean {
		return this.currentPendingEdit !== undefined;
	}

	/**
	 * Dispose all resources
	 */
	dispose(): void {
		this.deletionDecoration.dispose();
		this.insertionDecoration.dispose();
		this.keyboardDisposables.forEach((d) => d.dispose());
		if (this.documentChangeDisposable) {
			this.documentChangeDisposable.dispose();
		}
	}

	/**
	 * Register keyboard handlers for accept/reject
	 */
	private registerKeyboardHandlers(editor: vscode.TextEditor): void {
		// Tab or Enter to accept
		const acceptCommand = vscode.commands.registerCommand(
			'llama-coder.acceptInlineEdit',
			async () => {
				await this.acceptEdit();
			}
		);

		// Escape to reject
		const rejectCommand = vscode.commands.registerCommand(
			'llama-coder.rejectInlineEdit',
			() => {
				this.rejectEdit(editor);
			}
		);

		this.keyboardDisposables.push(acceptCommand, rejectCommand);
	}

	/**
	 * Register document change listener for auto-cleanup
	 */
	private registerDocumentChangeListener(editor: vscode.TextEditor): void {
		if (!this.currentPendingEdit) {
			return;
		}

		const { range, editor: pendingEditor } = this.currentPendingEdit;

		this.documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(
			(event) => {
				// Only react to changes in the same document
				if (event.document.uri.toString() !== editor.document.uri.toString()) {
					return;
				}

				// Check if any change overlaps with our decorated range
				for (const change of event.contentChanges) {
					// If change is outside our range, ignore
					if (change.range.end.isBefore(range.start)) {
						continue;
					}
					if (change.range.start.isAfter(range.end)) {
						continue;
					}

					// Change overlaps with decorated range - clear decorations
					this.clear(pendingEditor);
					return;
				}
			}
		);
	}
}
