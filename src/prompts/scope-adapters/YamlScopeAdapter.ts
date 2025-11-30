/**
 * YamlScopeAdapter - YAML-specific scope detection using indentation
 *
 * Handles YAML's indentation-based structure to detect logical units
 * like key-value blocks and list items.
 */

import * as vscode from 'vscode';
import {
	IScopeAdapter,
	ReplacementContext,
	LogicalUnit,
} from './IScopeAdapter';

export class YamlScopeAdapter implements IScopeAdapter {
	/**
	 * Check if cursor is mid-statement (incomplete)
	 */
	isIncomplete(context: ReplacementContext): boolean {
		const line = context.document.lineAt(context.position.line);
		const textBeforeCursor = line.text.substring(0, context.position.character);
		const textAfterCursor = line.text.substring(context.position.character);

		// Special case: If we're typing a YAML key at the start of a line
		// (e.g., "  ansible.builtin." when there's "  shell: ..." after cursor),
		// this is likely a replacement scenario, NOT incomplete
		const typingKeyMatch = textBeforeCursor.match(/^\s*([a-zA-Z_][\w.-]*)$/);
		if (typingKeyMatch) {
			// We're typing a key name at the start of a line
			// This is a replacement scenario, not incomplete - allow it
			return false;
		}

		// If we're on a complete YAML key line (e.g., "  shell:" or "  ansible.builtin.shell:"),
		// cursor at end of key is valid for replacement
		const completeKeyMatch = textBeforeCursor.match(/^\s*([a-zA-Z_][\w.-]*):?\s*$/);
		if (completeKeyMatch) {
			// Cursor is at end of a key (with or without colon), not incomplete
			return false;
		}

		// Check if we're in the middle of a key (e.g., "  sh|ell:")
		// where | is the cursor and there's part of the key after it
		const midKeyMatch = textBeforeCursor.match(/^\s*([a-zA-Z_][\w.-]*)$/);
		if (midKeyMatch && textAfterCursor.match(/^([a-zA-Z_][\w.-]*)/)) {
			// We're mid-key, this is incomplete
			return true;
		}

		// Check if there's a quote or bracket that's unclosed
		const unclosedQuote = (textBeforeCursor.match(/"/g) || []).length % 2 !== 0;
		const unclosedSingleQuote = (textBeforeCursor.match(/'/g) || []).length % 2 !== 0;
		if (unclosedQuote || unclosedSingleQuote) {
			return true; // Inside a string literal
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
		// Try to detect YAML key-value block
		const keyValueMatch = completion.match(/^(\s*)([a-zA-Z_][\w.-]*)\s*:\s*/);
		if (keyValueMatch) {
			const indent = this.getIndentLevel(keyValueMatch[1]);
			const key = keyValueMatch[2];

			return {
				type: 'yaml-key-value-block',
				identifier: key,
				baseConfidence: 0.9,
				indentLevel: indent,
				metadata: {
					fullMatch: keyValueMatch[0],
				},
			};
		}

		// Try to detect YAML list item
		const listItemMatch = completion.match(/^(\s*)-\s+/);
		if (listItemMatch) {
			const indent = this.getIndentLevel(listItemMatch[1]);

			return {
				type: 'yaml-list-item',
				identifier: 'list-item',
				baseConfidence: 0.85,
				indentLevel: indent,
				metadata: {
					fullMatch: listItemMatch[0],
				},
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
		if (unit.type === 'yaml-key-value-block') {
			return this.findKeyValueBlockRange(context, unit);
		} else if (unit.type === 'yaml-list-item') {
			return this.findListItemRange(context, unit);
		}

		return null;
	}

	/**
	 * Find range for YAML key-value block
	 */
	private findKeyValueBlockRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null {
		const document = context.document;
		const cursorLine = context.position.line;
		const targetIndent = unit.indentLevel ?? 0;

		console.log(`[YamlAdapter] findKeyValueBlockRange: cursorLine=${cursorLine}, targetIndent=${targetIndent}, key="${unit.identifier}"`);

		// Special case: If cursor is on a blank/nearly-blank line after a key (e.g., after pressing Enter),
		// look for the NEXT non-empty block at the same indent to replace (positional replacement)
		const currentLineText = document.lineAt(cursorLine).text.trim();
		const previousLine = cursorLine > 0 ? document.lineAt(cursorLine - 1) : null;

		console.log(`[YamlAdapter] Positional check: currentLineText="${currentLineText}"`);
		if (previousLine) {
			console.log(`[YamlAdapter] Previous line (L${cursorLine}): "${previousLine.text}"`);
		}

		if (currentLineText === '' && previousLine) {
			const prevText = previousLine.text;
			const prevKeyMatch = prevText.match(/^(\s*)([a-zA-Z_][\w.-]*)\s*:\s*$/);

			console.log(`[YamlAdapter] Testing positional replacement, prevKeyMatch:`, prevKeyMatch);

			if (prevKeyMatch) {
				// Previous line was a key with just a colon (e.g., "  ansible.builtin.shell:")
				// Look for next block at same indent to replace
				const prevIndent = this.getIndentLevel(prevText);

				console.log(`[YamlAdapter] ✓ Positional mode activated! Previous line matched, prevIndent=${prevIndent}`);
				console.log(`[YamlAdapter] Searching forward from L${cursorLine + 1} for children (indent > ${prevIndent})...`);

				for (let i = cursorLine + 1; i < document.lineCount; i++) {
					const line = document.lineAt(i);
					const lineText = line.text;

					// Skip empty lines and comments
					if (lineText.trim() === '' || lineText.trim().startsWith('#')) {
						console.log(`[YamlAdapter]   L${i + 1}: Skip (empty/comment)`);
						continue;
					}

					const lineIndent = this.getIndentLevel(lineText);
					console.log(`[YamlAdapter]   L${i + 1} (indent=${lineIndent}): "${lineText.substring(0, 60)}${lineText.length > 60 ? '...' : ''}"`);

					// If we find content indented more than the key, this is a child block to replace
					if (lineIndent > prevIndent) {
						const keyMatch = lineText.match(/^(\s*)([a-zA-Z_][\w.-]*)\s*:/);
						if (keyMatch) {
							// Found an old key-value block at same indent - replace it!
							console.log(`[YamlAdapter]   ✓ Found old block at L${i + 1}, key="${keyMatch[2]}"`);
							const range = this.findBlockRange(document, i, prevIndent);
							console.log(`[YamlAdapter]   DELETE RANGE: L${range.start.line + 1}-L${range.end.line + 1} (${range.end.line - range.start.line + 1} lines)`);
							const deletedText = document.getText(range);
							console.log(`[YamlAdapter]   DELETED TEXT:\n${deletedText.split('\n').map((l, idx) => `      L${range.start.line + 1 + idx}: ${l}`).join('\n')}`);
							return range;
						}
						console.log(`[YamlAdapter]   Line at same indent but not a key-value block`);
					}

					// If we hit something at lower indent, stop searching
					if (lineIndent < prevIndent) {
						console.log(`[YamlAdapter]   Hit lower indent (${lineIndent} < ${prevIndent}), stopping search`);
						break;
					}
				}
				console.log(`[YamlAdapter] ✗ Positional search complete, no matching block found`);
			} else {
				console.log(`[YamlAdapter] ✗ Previous line doesn't match key pattern`);
			}
		} else {
			if (currentLineText !== '') {
				console.log(`[YamlAdapter] Not positional mode: current line not empty`);
			} else if (!previousLine) {
				console.log(`[YamlAdapter] Not positional mode: no previous line`);
			}
		}

		// Standard case: Search backward and forward for matching key at same indent
		console.log(`[YamlAdapter] Starting standard key search for "${unit.identifier}" at indent ${targetIndent}...`);
		let matchLine = -1;

		// Search backward from cursor
		console.log(`[YamlAdapter] Searching backward from L${cursorLine}...`);
		for (let i = cursorLine; i >= 0; i--) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines and comments
			if (lineText.trim() === '' || lineText.trim().startsWith('#')) {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If we've gone past our indent level, stop searching
			if (lineIndent < targetIndent) {
				console.log(`[YamlAdapter]   L${i + 1}: Hit lower indent (${lineIndent} < ${targetIndent}), stopping backward search`);
				break;
			}

			// Check if this line matches our key at the same indent
			if (lineIndent === targetIndent) {
				const keyMatch = lineText.match(/^(\s*)([a-zA-Z_][\w.-]*)\s*:/);
				if (keyMatch) {
					const matches = this.keysMatch(keyMatch[2], unit.identifier);
					console.log(`[YamlAdapter]   L${i + 1} (indent=${lineIndent}): key="${keyMatch[2]}", matches=${matches}`);
					if (matches) {
						matchLine = i;
						console.log(`[YamlAdapter]   ✓ Found matching key at L${i + 1}`);
						break;
					}
				}
			}
		}

		// If not found backward, search forward
		if (matchLine === -1) {
			console.log(`[YamlAdapter] Not found backward, searching forward from L${cursorLine + 1}...`);
			for (let i = cursorLine + 1; i < document.lineCount; i++) {
				const line = document.lineAt(i);
				const lineText = line.text;

				// Skip empty lines and comments
				if (lineText.trim() === '' || lineText.trim().startsWith('#')) {
					continue;
				}

				const lineIndent = this.getIndentLevel(lineText);

				// If we've gone past our indent level, stop searching
				if (lineIndent < targetIndent) {
					console.log(`[YamlAdapter]   L${i + 1}: Hit lower indent (${lineIndent} < ${targetIndent}), stopping forward search`);
					break;
				}

				// Check if this line matches our key at the same indent
				if (lineIndent === targetIndent) {
					const keyMatch = lineText.match(/^(\s*)([a-zA-Z_][\w.-]*)\s*:/);
					if (keyMatch) {
						const matches = this.keysMatch(keyMatch[2], unit.identifier);
						console.log(`[YamlAdapter]   L${i + 1} (indent=${lineIndent}): key="${keyMatch[2]}", matches=${matches}`);
						if (matches) {
							matchLine = i;
							console.log(`[YamlAdapter]   ✓ Found matching key at L${i + 1}`);
							break;
						}
					}
				}
			}
		}

		if (matchLine === -1) {
			console.log(`[YamlAdapter] ✗ No matching key found`);
			return null; // No matching key found
		}

		// Find the end of the block (where indent returns to same or lower level)
		console.log(`[YamlAdapter] Finding block end from L${matchLine + 1}...`);
		let endLine = matchLine;
		for (let i = matchLine + 1; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Skip empty lines
			if (lineText.trim() === '') {
				continue;
			}

			const lineIndent = this.getIndentLevel(lineText);

			// If indent returns to same or lower level, we've found the end
			if (lineIndent <= targetIndent) {
				console.log(`[YamlAdapter]   L${i + 1}: Found end at indent ${lineIndent}`);
				break;
			}

			endLine = i;
		}

		// Create range from start of key line to end of block
		const range = new vscode.Range(
			new vscode.Position(matchLine, 0),
			new vscode.Position(endLine, document.lineAt(endLine).text.length)
		);
		console.log(`[YamlAdapter] ✓ DELETE RANGE: L${range.start.line + 1}-L${range.end.line + 1} (${range.end.line - range.start.line + 1} lines)`);
		const deletedText = document.getText(range);
		console.log(`[YamlAdapter] DELETED TEXT:\n${deletedText.split('\n').map((l, idx) => `    L${range.start.line + 1 + idx}: ${l}`).join('\n')}`);
		return range;
	}

	/**
	 * Find range for YAML list item
	 */
	private findListItemRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null {
		const document = context.document;
		const cursorLine = context.position.line;
		const targetIndent = unit.indentLevel ?? 0;

		// Search backward for list item at same indent
		let matchLine = -1;

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

			// Check if this line is a list item at the same indent
			if (lineIndent === targetIndent && lineText.trim().startsWith('-')) {
				matchLine = i;
				break;
			}
		}

		if (matchLine === -1) {
			return null; // No matching list item found
		}

		// Find the end of the list item block
		let endLine = matchLine;
		for (let i = matchLine + 1; i < document.lineCount; i++) {
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

		// Create range from start of list item to end of block
		return new vscode.Range(
			new vscode.Position(matchLine, 0),
			new vscode.Position(endLine, document.lineAt(endLine).text.length)
		);
	}

	/**
	 * Find the range of a block starting at matchLine with given indent
	 */
	private findBlockRange(
		document: vscode.TextDocument,
		matchLine: number,
		targetIndent: number
	): vscode.Range {
		// Find the end of the block (where indent returns to same or lower level)
		let endLine = matchLine;
		for (let i = matchLine + 1; i < document.lineCount; i++) {
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

		// Create range from start of key line to end of block
		return new vscode.Range(
			new vscode.Position(matchLine, 0),
			new vscode.Position(endLine, document.lineAt(endLine).text.length)
		);
	}

	/**
	 * Check if two YAML keys match (supports suffix matching for ansible.builtin.X)
	 */
	private keysMatch(existingKey: string, newKey: string): boolean {
		// Exact match
		if (existingKey === newKey) {
			return true;
		}

		// Check if newKey is a fully qualified version of existingKey
		// e.g., existingKey="shell", newKey="ansible.builtin.shell"
		if (newKey.endsWith('.' + existingKey)) {
			return true;
		}

		// Check if existingKey is a fully qualified version of newKey
		// e.g., existingKey="ansible.builtin.shell", newKey="shell"
		if (existingKey.endsWith('.' + newKey)) {
			return true;
		}

		return false;
	}

	/**
	 * Get indentation level in spaces (tabs = 2 spaces for YAML)
	 */
	private getIndentLevel(text: string): number {
		let spaces = 0;
		for (const char of text) {
			if (char === ' ') {
				spaces++;
			} else if (char === '\t') {
				spaces += 2; // YAML convention: 2 spaces per tab
			} else {
				break;
			}
		}
		return spaces;
	}
}
