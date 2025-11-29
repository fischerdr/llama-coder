/**
 * ReplacementAnalyzer - Orchestrates smart code replacement decisions
 *
 * Coordinates language-specific scope detection through adapters and makes
 * intelligent decisions about whether to replace existing code or insert new code.
 */

import * as vscode from 'vscode';
import { info } from '../modules/log';
import { config } from '../config';
import {
	IScopeAdapter,
	ReplacementContext,
	LogicalUnit,
} from './scope-adapters/IScopeAdapter';
import { YamlScopeAdapter } from './scope-adapters/YamlScopeAdapter';
import { PythonScopeAdapter } from './scope-adapters/PythonScopeAdapter';
import { BracketScopeAdapter } from './scope-adapters/BracketScopeAdapter';

/**
 * Result of replacement analysis
 */
export interface ReplacementAnalysis {
	/** Whether to replace existing code */
	shouldReplace: boolean;
	/** Range of code to replace (null for insert-only) */
	replaceRange: vscode.Range | null;
	/** Text to insert */
	insertText: string;
	/** Confidence score (0-1) */
	confidence: number;
	/** Explanation for debugging */
	reason: string;
	/** Type of logical unit detected */
	logicalUnitType: string | null;
	/** Whether to show visual diff decorations */
	showVisualDiff: boolean;
	/** Number of lines being replaced */
	replacedLines: number;
}

/**
 * ReplacementAnalyzer class
 */
export class ReplacementAnalyzer {
	private adapters: Map<string, IScopeAdapter> = new Map();
	private fallbackAdapter: IScopeAdapter;

	constructor() {
		// Register language-specific adapters
		const yamlAdapter = new YamlScopeAdapter();
		this.adapters.set('yaml', yamlAdapter);
		this.adapters.set('ansible', yamlAdapter);

		const pythonAdapter = new PythonScopeAdapter();
		this.adapters.set('python', pythonAdapter);

		// Fallback for bracket-based languages
		this.fallbackAdapter = new BracketScopeAdapter();
	}

	/**
	 * Analyze a completion and decide whether to replace or insert
	 */
	analyze(context: ReplacementContext): ReplacementAnalysis {
		// Early exit if replacements disabled
		if (!context.enableReplacements) {
			return this.insertOnlyResult(
				context.completion,
				'Replacements disabled in config'
			);
		}

		// Get language-specific adapter
		const adapter = this.getAdapter(context);

		// Check for incompleteness (mid-statement cursor)
		if (adapter.isIncomplete(context)) {
			return this.insertOnlyResult(
				context.completion,
				'Cursor is mid-statement (incomplete)'
			);
		}

		// Detect logical unit in completion
		const unit = adapter.detectLogicalUnit(context.completion, context);
		if (!unit) {
			// Fall back to single-line partial word replacement
			return this.singleLineReplacement(context);
		}

		// Find matching code to replace
		const replaceRange = adapter.findReplacementRange(context, unit);
		if (!replaceRange) {
			return this.insertOnlyResult(
				context.completion,
				`Logical unit '${unit.type}' detected but no match found in existing code`
			);
		}

		// Calculate confidence score
		const confidence = this.calculateConfidence(context, unit, replaceRange);

		// Apply confidence threshold
		const minConfidence = config.completion.minConfidence;
		if (confidence < minConfidence) {
			return this.insertOnlyResult(
				context.completion,
				`Confidence ${confidence.toFixed(2)} below threshold ${minConfidence}`
			);
		}

		// Calculate number of lines being replaced
		const replacedLines = replaceRange.end.line - replaceRange.start.line + 1;

		// Determine if we should show visual diff decorations
		// Show visual diff if:
		// - Multi-line replacement (2+ lines)
		// - OR high confidence (>0.85)
		// - OR large code change (>50 chars diff)
		const existingCode = context.document.getText(replaceRange);
		const charDiff = Math.abs(context.completion.length - existingCode.length);
		const showVisualDiff =
			replacedLines >= 2 || confidence > 0.85 || charDiff > 50;

		// Success - perform replacement
		return {
			shouldReplace: true,
			replaceRange,
			insertText: context.completion,
			confidence,
			reason: `Replace ${unit.type} '${unit.identifier}' (confidence: ${confidence.toFixed(2)})`,
			logicalUnitType: unit.type,
			showVisualDiff,
			replacedLines,
		};
	}

	/**
	 * Get adapter for the current language
	 */
	private getAdapter(context: ReplacementContext): IScopeAdapter {
		if (context.language) {
			const adapter = this.adapters.get(context.language);
			if (adapter) {
				return adapter;
			}
		}
		return this.fallbackAdapter;
	}

	/**
	 * Calculate confidence score for replacement
	 */
	private calculateConfidence(
		context: ReplacementContext,
		unit: LogicalUnit,
		replaceRange: vscode.Range
	): number {
		let confidence = unit.baseConfidence;

		// Get existing code that would be replaced
		const existingCode = context.document.getText(replaceRange);

		// Check similarity between completion and existing code
		const similarity = this.calculateSimilarity(
			context.completion,
			existingCode
		);

		// Adjustment: +0.2 if 30-70% similar (partial match suggests refactoring)
		if (similarity >= 0.3 && similarity <= 0.7) {
			confidence += 0.2;
			info(`  Similarity ${similarity.toFixed(2)} suggests refactoring (+0.2)`);
		}

		// Adjustment: -0.3 if >90% similar (might be no change needed)
		if (similarity > 0.9) {
			confidence -= 0.3;
			info(`  Similarity ${similarity.toFixed(2)} very high, might be duplicate (-0.3)`);
		}

		// Adjustment: +0.1 if indent levels match
		if (unit.indentLevel !== undefined) {
			const existingIndent = this.getIndentLevel(
				context.document.lineAt(replaceRange.start.line).text
			);
			if (existingIndent === unit.indentLevel) {
				confidence += 0.1;
				info(`  Indent levels match (+0.1)`);
			}
		}

		// Cap confidence at 1.0
		return Math.min(confidence, 1.0);
	}

	/**
	 * Calculate similarity between two strings (simple character-based)
	 */
	private calculateSimilarity(str1: string, str2: string): number {
		// Normalize whitespace
		const norm1 = str1.replace(/\s+/g, ' ').trim();
		const norm2 = str2.replace(/\s+/g, ' ').trim();

		if (norm1 === norm2) {
			return 1.0;
		}

		// Simple Levenshtein-inspired similarity
		const maxLen = Math.max(norm1.length, norm2.length);
		if (maxLen === 0) {
			return 1.0;
		}

		// Count matching characters at start
		let matches = 0;
		for (let i = 0; i < Math.min(norm1.length, norm2.length); i++) {
			if (norm1[i] === norm2[i]) {
				matches++;
			}
		}

		return matches / maxLen;
	}

	/**
	 * Get indentation level (spaces)
	 */
	private getIndentLevel(line: string): number {
		let spaces = 0;
		for (const char of line) {
			if (char === ' ') {
				spaces++;
			} else if (char === '\t') {
				spaces += 4; // Assume 4 spaces per tab
			} else {
				break;
			}
		}
		return spaces;
	}

	/**
	 * Single-line partial word replacement (fallback)
	 */
	private singleLineReplacement(context: ReplacementContext): ReplacementAnalysis {
		const lineText = context.document.lineAt(context.position.line).text;
		const textBeforeCursor = lineText.substring(0, context.position.character);

		// Find the start of the current word/identifier
		const wordMatch = textBeforeCursor.match(/[\w.:-]+$/);
		if (!wordMatch) {
			return this.insertOnlyResult(
				context.completion,
				'No partial word found for single-line replacement'
			);
		}

		const partialText = wordMatch[0];
		const startChar = context.position.character - partialText.length;

		// Check if completion starts with partial text
		if (context.completion.startsWith(partialText)) {
			// Direct replacement
			return {
				shouldReplace: true,
				replaceRange: new vscode.Range(
					new vscode.Position(context.position.line, startChar),
					context.position
				),
				insertText: context.completion,
				confidence: 0.8,
				reason: `Single-line partial word replacement: "${partialText}"`,
				logicalUnitType: 'partial-word',
				showVisualDiff: false, // Single-line replacements don't show visual diff
				replacedLines: 1,
			};
		} else {
			// Prepend partial text for VS Code ghost text compatibility
			return {
				shouldReplace: true,
				replaceRange: new vscode.Range(
					new vscode.Position(context.position.line, startChar),
					context.position
				),
				insertText: partialText + context.completion,
				confidence: 0.8,
				reason: `Single-line smart replacement: prepend "${partialText}"`,
				logicalUnitType: 'partial-word',
				showVisualDiff: false, // Single-line replacements don't show visual diff
				replacedLines: 1,
			};
		}
	}

	/**
	 * Create insert-only result
	 */
	private insertOnlyResult(text: string, reason: string): ReplacementAnalysis {
		return {
			shouldReplace: false,
			replaceRange: null,
			insertText: text,
			confidence: 0,
			reason,
			logicalUnitType: null,
			showVisualDiff: false,
			replacedLines: 0,
		};
	}
}

/**
 * Singleton instance
 */
let replacementAnalyzerInstance: ReplacementAnalyzer | null = null;

export function getReplacementAnalyzer(): ReplacementAnalyzer {
	if (!replacementAnalyzerInstance) {
		replacementAnalyzerInstance = new ReplacementAnalyzer();
	}
	return replacementAnalyzerInstance;
}
