/**
 * PythonScopeAdapter - Python-specific scope detection
 *
 * Handles Python's indentation-based structure with special support for
 * functions, classes, decorators, and control flow blocks.
 */

import * as vscode from 'vscode';
import {
	IScopeAdapter,
	ReplacementContext,
	LogicalUnit,
} from './IScopeAdapter';
import { ScopeDetector } from '../../context/ScopeDetector';

export class PythonScopeAdapter implements IScopeAdapter {
	/**
	 * Check if cursor is mid-statement (incomplete)
	 */
	isIncomplete(context: ReplacementContext): boolean {
		const line = context.document.lineAt(context.position.line);
		const textAfterCursor = line.text.substring(context.position.character);

		// Check for unbalanced brackets after cursor on same line
		let balance = 0;
		for (const char of textAfterCursor) {
			if (char === '(' || char === '[' || char === '{') {
				balance++;
			} else if (char === ')' || char === ']' || char === '}') {
				balance--;
			}
		}

		if (balance !== 0) {
			return true; // Unbalanced brackets after cursor
		}

		// Check if inside string literal (simple check)
		const beforeCursor = line.text.substring(0, context.position.character);
		const singleQuotes = (beforeCursor.match(/'/g) || []).length;
		const doubleQuotes = (beforeCursor.match(/"/g) || []).length;

		if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
			return true; // Inside string literal
		}

		// Use ScopeDetector for global bracket balance
		const scopeDetector = new ScopeDetector();
		const scopeInfo = scopeDetector.detect(context.prefix);

		if (
			scopeInfo.balance.curly !== 0 ||
			scopeInfo.balance.paren !== 0 ||
			scopeInfo.balance.square !== 0
		) {
			return true; // Global unbalanced brackets
		}

		return false;
	}

	/**
	 * Detect logical unit in completion
	 */
	detectLogicalUnit(
		completion: string,
		context: ReplacementContext
	): LogicalUnit | null {
		// Try to detect Python function
		const funcMatch = completion.match(
			/^(\s*)(?:async\s+)?def\s+([a-zA-Z_]\w*)\s*\(/
		);
		if (funcMatch) {
			const indent = this.getIndentLevel(funcMatch[1]);
			const funcName = funcMatch[2];

			return {
				type: 'python-function',
				identifier: funcName,
				baseConfidence: 0.95,
				indentLevel: indent,
				metadata: {
					isAsync: funcMatch[0].includes('async'),
				},
			};
		}

		// Try to detect Python class
		const classMatch = completion.match(/^(\s*)class\s+([a-zA-Z_]\w*)\s*[(:]/);
		if (classMatch) {
			const indent = this.getIndentLevel(classMatch[1]);
			const className = classMatch[2];

			return {
				type: 'python-class',
				identifier: className,
				baseConfidence: 0.95,
				indentLevel: indent,
			};
		}

		// Try to detect Python block (if/for/while/etc)
		const blockMatch = completion.match(
			/^(\s*)(if|for|while|with|try|except|finally|elif|else)\s+/
		);
		if (blockMatch) {
			const indent = this.getIndentLevel(blockMatch[1]);
			const keyword = blockMatch[2];

			return {
				type: 'python-block',
				identifier: keyword,
				baseConfidence: 0.8,
				indentLevel: indent,
				metadata: {
					keyword,
				},
			};
		}

		// Try to detect decorator
		const decoratorMatch = completion.match(/^(\s*)@([a-zA-Z_]\w*)/);
		if (decoratorMatch) {
			const indent = this.getIndentLevel(decoratorMatch[1]);
			const decoratorName = decoratorMatch[2];

			return {
				type: 'python-decorator',
				identifier: decoratorName,
				baseConfidence: 0.9,
				indentLevel: indent,
			};
		}

		return null;
	}

	/**
	 * Find replacement range for the logical unit
	 */
	findReplacementRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null {
		if (unit.type === 'python-function') {
			return this.findFunctionRange(context, unit);
		} else if (unit.type === 'python-class') {
			return this.findClassRange(context, unit);
		} else if (unit.type === 'python-block') {
			return this.findBlockRange(context, unit);
		} else if (unit.type === 'python-decorator') {
			return this.findDecoratorRange(context, unit);
		}

		return null;
	}

	/**
	 * Find range for Python function (includes decorators)
	 */
	private findFunctionRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null {
		const document = context.document;
		const cursorLine = context.position.line;
		const targetIndent = unit.indentLevel ?? 0;

		// Special case: If cursor is on a blank line after a function definition (e.g., after pressing Enter),
		// look for the NEXT function/block at the same indent to replace (positional replacement)
		const currentLineText = document.lineAt(cursorLine).text.trim();
		const previousLine = cursorLine > 0 ? document.lineAt(cursorLine - 1) : null;

		if (currentLineText === '' && previousLine) {
			const prevText = previousLine.text;
			const prevDefMatch = prevText.match(/^\s*(?:async\s+)?def\s+([a-zA-Z_]\w*)\s*\(.*\)\s*:\s*$/);

			if (prevDefMatch) {
				// Previous line was a function def with just a colon (e.g., "def foo():")
				// Look for next function/block at same indent to replace
				const prevIndent = this.getIndentLevel(prevText);

				for (let i = cursorLine + 1; i < document.lineCount; i++) {
					const line = document.lineAt(i);
					const lineText = line.text;

					// Skip empty lines and comments
					if (lineText.trim() === '' || lineText.trim().startsWith('#')) {
						continue;
					}

					const lineIndent = this.getIndentLevel(lineText);

					// If we find a function at same indent, this is the old block to replace
					if (lineIndent === prevIndent) {
						const funcMatch = lineText.match(/^\s*(?:async\s+)?def\s+([a-zA-Z_]\w*)\s*\(/);
						const classMatch = lineText.match(/^\s*class\s+([a-zA-Z_]\w*)/);

						if (funcMatch || classMatch) {
							// Found an old function/class at same indent - replace it!
							return this.findBlockRangeFromLine(document, i, prevIndent);
						}
					}

					// If we hit something at lower indent, stop searching
					if (lineIndent < prevIndent) {
						break;
					}
				}
			}
		}

		// Standard case: Search backward for function definition
		let defLine = -1;

		for (let i = cursorLine; i >= 0; i--) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines and comments
			if (lineText.trim() === '' || lineText.trim().startsWith('#')) {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If we've gone past our indent level, stop
			if (lineIndent < targetIndent) {
				break;
			}

			// Check if this is our function definition
			if (lineIndent === targetIndent) {
				const funcMatch = lineText.match(
					/^\s*(?:async\s+)?def\s+([a-zA-Z_]\w*)\s*\(/
				);
				if (funcMatch && funcMatch[1] === unit.identifier) {
					defLine = i;
					break;
				}
			}
		}

		if (defLine === -1) {
			return null; // Function not found
		}

		// Search backward for decorators
		let startLine = defLine;
		for (let i = defLine - 1; i >= 0; i--) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines
			if (lineText.trim() === '') {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// Stop if indent is less than target
			if (lineIndent < targetIndent) {
				break;
			}

			// Check if this is a decorator at same indent
			if (lineIndent === targetIndent && lineText.trim().startsWith('@')) {
				startLine = i;
			} else {
				break; // Not a decorator, stop searching
			}
		}

		// Find the end of the function body
		let endLine = defLine;
		for (let i = defLine + 1; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines
			if (lineText.trim() === '') {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If indent returns to same or lower level, we've found the end
			if (lineIndent <= targetIndent) {
				break;
			}

			endLine = i;
		}

		// Create range from first decorator (or def line) to end of body
		return new vscode.Range(
			new vscode.Position(startLine, 0),
			new vscode.Position(endLine, document.lineAt(endLine).text.length)
		);
	}

	/**
	 * Find range for Python class
	 */
	private findClassRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null {
		const document = context.document;
		const cursorLine = context.position.line;
		const targetIndent = unit.indentLevel ?? 0;

		// Search backward for class definition
		let classLine = -1;

		for (let i = cursorLine; i >= 0; i--) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines and comments
			if (lineText.trim() === '' || lineText.trim().startsWith('#')) {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If we've gone past our indent level, stop
			if (lineIndent < targetIndent) {
				break;
			}

			// Check if this is our class definition
			if (lineIndent === targetIndent) {
				const classMatch = lineText.match(/^\s*class\s+([a-zA-Z_]\w*)\s*[(:]/);
				if (classMatch && classMatch[1] === unit.identifier) {
					classLine = i;
					break;
				}
			}
		}

		if (classLine === -1) {
			return null; // Class not found
		}

		// Find the end of the class body
		let endLine = classLine;
		for (let i = classLine + 1; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines
			if (lineText.trim() === '') {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If indent returns to same or lower level, we've found the end
			if (lineIndent <= targetIndent) {
				break;
			}

			endLine = i;
		}

		// Create range from class line to end of body
		return new vscode.Range(
			new vscode.Position(classLine, 0),
			new vscode.Position(endLine, document.lineAt(endLine).text.length)
		);
	}

	/**
	 * Find range for Python block (if/for/while/etc)
	 */
	private findBlockRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null {
		const document = context.document;
		const cursorLine = context.position.line;
		const targetIndent = unit.indentLevel ?? 0;
		const keyword = unit.metadata?.keyword as string;

		// Search backward for block start
		let blockLine = -1;

		for (let i = cursorLine; i >= 0; i--) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines and comments
			if (lineText.trim() === '' || lineText.trim().startsWith('#')) {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If we've gone past our indent level, stop
			if (lineIndent < targetIndent) {
				break;
			}

			// Check if this line starts with our keyword
			if (lineIndent === targetIndent) {
				const blockMatch = lineText.match(/^\s*(if|for|while|with|try|except|finally|elif|else)\s+/);
				if (blockMatch && blockMatch[1] === keyword) {
					blockLine = i;
					break;
				}
			}
		}

		if (blockLine === -1) {
			return null; // Block not found
		}

		// Find the end of the block
		let endLine = blockLine;
		for (let i = blockLine + 1; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines
			if (lineText.trim() === '') {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If indent returns to same or lower level, we've found the end
			if (lineIndent <= targetIndent) {
				break;
			}

			endLine = i;
		}

		// Create range from block line to end
		return new vscode.Range(
			new vscode.Position(blockLine, 0),
			new vscode.Position(endLine, document.lineAt(endLine).text.length)
		);
	}

	/**
	 * Helper to find block range starting from a specific line
	 */
	private findBlockRangeFromLine(
		document: vscode.TextDocument,
		startLine: number,
		baseIndent: number
	): vscode.Range {
		// Check for decorators before the start line
		let decoratorStart = startLine;
		for (let i = startLine - 1; i >= 0; i--) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines
			if (lineText.trim() === '') {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// Stop if indent is less than base
			if (lineIndent < baseIndent) {
				break;
			}

			// Check if this is a decorator at same indent
			if (lineIndent === baseIndent && lineText.trim().startsWith('@')) {
				decoratorStart = i;
			} else {
				break; // Not a decorator, stop searching
			}
		}

		// Find the end of the block
		let endLine = startLine;
		for (let i = startLine + 1; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines
			if (lineText.trim() === '') {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If indent returns to base or lower level, we've found the end
			if (lineIndent <= baseIndent) {
				break;
			}

			endLine = i;
		}

		// Create range from decorator/function start to end of block
		return new vscode.Range(
			new vscode.Position(decoratorStart, 0),
			new vscode.Position(endLine, document.lineAt(endLine).text.length)
		);
	}

	/**
	 * Find range for decorator
	 */
	private findDecoratorRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null {
		const document = context.document;
		const cursorLine = context.position.line;
		const targetIndent = unit.indentLevel ?? 0;

		// Search backward for decorator
		let decoratorLine = -1;

		for (let i = cursorLine; i >= 0; i--) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines
			if (lineText.trim() === '') {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If we've gone past our indent level, stop
			if (lineIndent < targetIndent) {
				break;
			}

			// Check if this is our decorator
			if (lineIndent === targetIndent) {
				const decoratorMatch = lineText.match(/^\s*@([a-zA-Z_]\w*)/);
				if (decoratorMatch && decoratorMatch[1] === unit.identifier) {
					decoratorLine = i;
					break;
				}
			}
		}

		if (decoratorLine === -1) {
			return null; // Decorator not found
		}

		// Decorator is typically single line, but include any continuation
		let endLine = decoratorLine;
		for (let i = decoratorLine + 1; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// If line doesn't start with @ and isn't empty, stop
			if (lineText.trim() !== '' && !lineText.trim().startsWith('@')) {
				break;
			}

			if (lineText.trim().startsWith('@')) {
				endLine = i;
			}
		}

		return new vscode.Range(
			new vscode.Position(decoratorLine, 0),
			new vscode.Position(endLine, document.lineAt(endLine).text.length)
		);
	}

	/**
	 * Get indentation level in spaces (tabs = 4 spaces for Python)
	 */
	private getIndentLevel(text: string): number {
		let spaces = 0;
		for (const char of text) {
			if (char === ' ') {
				spaces++;
			} else if (char === '\t') {
				spaces += 4; // Python convention: 4 spaces per tab
			} else {
				break;
			}
		}
		return spaces;
	}
}
