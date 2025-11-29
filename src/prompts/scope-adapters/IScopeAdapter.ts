/**
 * IScopeAdapter - Interface for language-specific scope detection
 *
 * Provides a pluggable system for detecting code boundaries and logical units
 * across different programming languages (YAML, Python, TypeScript, etc.).
 */

import * as vscode from 'vscode';
import { Language } from '../processors/languages';

/**
 * Logical unit detected in a completion
 */
export interface LogicalUnit {
	/** Type of logical unit (e.g., 'yaml-key-value-block', 'python-function') */
	type: string;
	/** Key identifier extracted from completion (e.g., function name, YAML key) */
	identifier: string;
	/** Base confidence score for this unit type (0-1) */
	baseConfidence: number;
	/** Indentation level if applicable */
	indentLevel?: number;
	/** Additional metadata for debugging */
	metadata?: Record<string, unknown>;
}

/**
 * Context for replacement analysis
 */
export interface ReplacementContext {
	/** The document being edited */
	document: vscode.TextDocument;
	/** Cursor position */
	position: vscode.Position;
	/** Text before cursor (from context builder) */
	prefix: string;
	/** Text after cursor (from context builder) */
	suffix: string;
	/** AI completion result */
	completion: string;
	/** Detected language */
	language: Language | null;
	/** Whether replacements are enabled */
	enableReplacements: boolean;
}

/**
 * Interface for language-specific scope adapters
 */
export interface IScopeAdapter {
	/**
	 * Check if the cursor position is in an incomplete statement
	 *
	 * @param context Replacement context
	 * @returns true if cursor is mid-statement (e.g., `if (x > |)`)
	 */
	isIncomplete(context: ReplacementContext): boolean;

	/**
	 * Detect the logical unit represented by the completion
	 *
	 * @param completion AI completion text
	 * @param context Replacement context
	 * @returns Detected logical unit or null if none found
	 */
	detectLogicalUnit(
		completion: string,
		context: ReplacementContext
	): LogicalUnit | null;

	/**
	 * Find the range of existing code to replace
	 *
	 * @param context Replacement context
	 * @param unit Detected logical unit
	 * @returns Range to replace or null if no match found
	 */
	findReplacementRange(
		context: ReplacementContext,
		unit: LogicalUnit
	): vscode.Range | null;
}
