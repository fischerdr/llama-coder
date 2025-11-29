/**
 * BracketScopeAdapter - Conservative fallback for bracket-based languages
 *
 * Used for TypeScript, JavaScript, and other bracket-based languages.
 * Focuses on incompleteness detection using existing ScopeDetector.
 * Returns null for logical unit detection, deferring to single-line replacement.
 */

import * as vscode from 'vscode';
import {
	IScopeAdapter,
	ReplacementContext,
	LogicalUnit,
} from './IScopeAdapter';
import { ScopeDetector } from '../../context/ScopeDetector';

export class BracketScopeAdapter implements IScopeAdapter {
	/**
	 * Check if cursor is mid-statement (incomplete)
	 */
	isIncomplete(context: ReplacementContext): boolean {
		const line = context.document.lineAt(context.position.line);
		const textAfterCursor = line.text.substring(context.position.character);

		// Check for unbalanced brackets after cursor on same line
		let balance = {
			curly: 0,
			paren: 0,
			square: 0,
		};

		for (const char of textAfterCursor) {
			if (char === '{') balance.curly++;
			else if (char === '}') balance.curly--;
			else if (char === '(') balance.paren++;
			else if (char === ')') balance.paren--;
			else if (char === '[') balance.square++;
			else if (char === ']') balance.square--;
		}

		if (
			balance.curly !== 0 ||
			balance.paren !== 0 ||
			balance.square !== 0
		) {
			return true; // Unbalanced brackets after cursor
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
	 * Detect logical unit - returns null to defer to single-line replacement
	 */
	detectLogicalUnit(
		completion: string,
		context: ReplacementContext
	): LogicalUnit | null {
		// Conservative approach: return null to use single-line fallback
		// Bracket-based languages are complex, so we avoid aggressive replacement
		return null;
	}

	/**
	 * Find replacement range - not used since detectLogicalUnit returns null
	 */
	findReplacementRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null {
		return null;
	}
}
