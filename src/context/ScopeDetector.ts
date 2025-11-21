/**
 * Code scope types
 */
export type ScopeType =
	| 'global' // Top-level scope
	| 'function' // Inside a function
	| 'method' // Inside a class method
	| 'class' // Inside a class body
	| 'block' // Inside a block (if, for, while, etc.)
	| 'object' // Inside an object literal
	| 'array'; // Inside an array literal

/**
 * Bracket types for tracking
 */
type BracketType = 'curly' | 'paren' | 'square';

/**
 * Bracket balance state
 */
interface BracketBalance {
	curly: number; // { }
	paren: number; // ( )
	square: number; // [ ]
}

/**
 * Detected scope information
 */
export interface ScopeInfo {
	/** Current scope type */
	type: ScopeType;
	/** Nesting depth (0 = global) */
	depth: number;
	/** Whether cursor is at a complete statement boundary */
	atStatementBoundary: boolean;
	/** Whether cursor is inside a string literal */
	inString: boolean;
	/** Whether cursor is inside a comment */
	inComment: boolean;
	/** Bracket balance at cursor position */
	balance: BracketBalance;
	/** Name of containing function/method/class if detected */
	containerName?: string;
}

/**
 * Scope detector using bracket balance heuristics
 *
 * Provides fast scope detection without full AST parsing.
 * Uses bracket counting and pattern matching to determine:
 * - Current nesting depth
 * - Scope type (function, class, block, etc.)
 * - Whether at a statement boundary
 *
 * Limitations:
 * - May be confused by brackets in strings/comments
 * - Cannot detect all scope types accurately
 * - Best effort heuristic, not 100% accurate
 */
export class ScopeDetector {
	/**
	 * Detect scope at cursor position
	 *
	 * @param prefix Code before cursor
	 * @param suffix Code after cursor (optional, for better detection)
	 * @returns Detected scope information
	 */
	detect(prefix: string, suffix = ''): ScopeInfo {
		// Track string and comment state
		const { inString, inComment, cleanedPrefix } = this.cleanCode(prefix);

		// Count brackets in cleaned code
		const balance = this.countBrackets(cleanedPrefix);

		// Determine scope depth
		const depth = balance.curly;

		// Determine scope type
		const type = this.detectScopeType(cleanedPrefix, balance);

		// Check if at statement boundary
		const atStatementBoundary = this.isAtStatementBoundary(
			cleanedPrefix,
			suffix
		);

		// Try to extract container name
		const containerName = this.extractContainerName(cleanedPrefix, type);

		return {
			type,
			depth,
			atStatementBoundary,
			inString,
			inComment,
			balance,
			containerName,
		};
	}

	/**
	 * Check if code is at top-level scope
	 * @param prefix Code before cursor
	 * @returns True if at global/module scope
	 */
	isTopLevel(prefix: string): boolean {
		const scope = this.detect(prefix);
		return scope.depth === 0 && scope.type === 'global';
	}

	/**
	 * Check if code is inside a function/method
	 * @param prefix Code before cursor
	 * @returns True if inside a function
	 */
	isInFunction(prefix: string): boolean {
		const scope = this.detect(prefix);
		return scope.type === 'function' || scope.type === 'method';
	}

	/**
	 * Get the recommended maximum lines for completion
	 *
	 * Based on scope, suggests how many lines the completion should be:
	 * - Global scope: More lines (could be a full function)
	 * - Inside function: Fewer lines (complete current statement/block)
	 * - Deep nesting: Very few lines (just complete current expression)
	 *
	 * @param prefix Code before cursor
	 * @returns Recommended max lines
	 */
	getRecommendedMaxLines(prefix: string): number {
		const scope = this.detect(prefix);

		if (scope.inString || scope.inComment) {
			return 1; // Just finish the string/comment
		}

		switch (scope.type) {
			case 'global':
				return 20; // Could be defining a new function
			case 'class':
				return 15; // Could be defining a method
			case 'function':
			case 'method':
				if (scope.depth <= 1) {
					return 10; // Function body
				}
				return 5; // Nested block
			case 'block':
				return 5; // Complete the block
			case 'object':
			case 'array':
				return 3; // Complete the literal
			default:
				return 5;
		}
	}

	/**
	 * Clean code by removing strings and comments
	 * Also tracks if cursor is inside string/comment
	 */
	private cleanCode(code: string): {
		inString: boolean;
		inComment: boolean;
		cleanedPrefix: string;
	} {
		let inString = false;
		let inComment = false;
		let stringChar = '';
		let cleaned = '';
		let i = 0;

		while (i < code.length) {
			const char = code[i];
			const nextChar = code[i + 1];

			// Track multi-line comments
			if (!inString && !inComment && char === '/' && nextChar === '*') {
				inComment = true;
				i += 2;
				continue;
			}

			if (inComment && char === '*' && nextChar === '/') {
				inComment = false;
				i += 2;
				continue;
			}

			// Track single-line comments
			if (!inString && !inComment && char === '/' && nextChar === '/') {
				// Skip to end of line
				while (i < code.length && code[i] !== '\n') {
					i++;
				}
				continue;
			}

			// Track strings
			if (!inComment && (char === '"' || char === "'" || char === '`')) {
				if (!inString) {
					inString = true;
					stringChar = char;
				} else if (char === stringChar && code[i - 1] !== '\\') {
					inString = false;
					stringChar = '';
				}
				i++;
				continue;
			}

			// Add non-string, non-comment characters
			if (!inString && !inComment) {
				cleaned += char;
			}

			i++;
		}

		return { inString, inComment, cleanedPrefix: cleaned };
	}

	/**
	 * Count bracket balance in code
	 */
	private countBrackets(code: string): BracketBalance {
		const balance: BracketBalance = { curly: 0, paren: 0, square: 0 };

		for (const char of code) {
			switch (char) {
				case '{':
					balance.curly++;
					break;
				case '}':
					balance.curly--;
					break;
				case '(':
					balance.paren++;
					break;
				case ')':
					balance.paren--;
					break;
				case '[':
					balance.square++;
					break;
				case ']':
					balance.square--;
					break;
			}
		}

		return balance;
	}

	/**
	 * Detect scope type from code patterns
	 */
	private detectScopeType(code: string, balance: BracketBalance): ScopeType {
		// Check array first (square brackets take precedence)
		if (balance.square > 0) {
			return 'array';
		}

		if (balance.curly <= 0) {
			return 'global';
		}

		// Look at recent code to determine context
		const recentCode = code.slice(-500);

		// Check for class context
		if (/class\s+\w+[^{]*\{\s*$/.test(recentCode)) {
			return 'class';
		}

		// Check for function/method context
		if (
			/(?:function\s+\w*|=>\s*)\s*\{[^}]*$/.test(recentCode) ||
			/(?:async\s+)?(?:function\s*\*?\s*\w*|\w+\s*)\([^)]*\)\s*(?::\s*\w+)?\s*\{[^}]*$/.test(
				recentCode
			)
		) {
			// Check if inside a class
			if (/class\s+\w+[^{]*\{/.test(code)) {
				return 'method';
			}
			return 'function';
		}

		// Check for object literal (key: value pattern)
		if (/[{,]\s*\w+\s*:\s*[^,}]*$/.test(recentCode)) {
			return 'object';
		}

		// Check for control flow blocks
		if (/(?:if|else|for|while|switch|try|catch|finally)\s*\([^)]*\)\s*\{/.test(recentCode)) {
			return 'block';
		}

		// Default to block for other curly contexts
		return 'block';
	}

	/**
	 * Check if at a statement boundary
	 */
	private isAtStatementBoundary(prefix: string, suffix: string): boolean {
		const trimmedPrefix = prefix.trimEnd();
		const trimmedSuffix = suffix.trimStart();

		// After semicolon, closing brace, or at line start
		if (
			trimmedPrefix.endsWith(';') ||
			trimmedPrefix.endsWith('{') ||
			trimmedPrefix.endsWith('}') ||
			trimmedPrefix.endsWith('\n') ||
			trimmedPrefix === ''
		) {
			return true;
		}

		// Before opening brace or semicolon
		if (
			trimmedSuffix.startsWith('{') ||
			trimmedSuffix.startsWith(';') ||
			trimmedSuffix.startsWith('}')
		) {
			return true;
		}

		return false;
	}

	/**
	 * Extract name of containing function/class/method
	 */
	private extractContainerName(
		code: string,
		type: ScopeType
	): string | undefined {
		if (type === 'global') {
			return undefined;
		}

		const recentCode = code.slice(-300);

		// Try to match function name
		const funcMatch = recentCode.match(
			/(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/
		);
		if (funcMatch) {
			return funcMatch[1] || funcMatch[2];
		}

		// Try to match class name
		const classMatch = recentCode.match(/class\s+(\w+)/);
		if (classMatch) {
			return classMatch[1];
		}

		// Try to match method name
		const methodMatch = recentCode.match(/(\w+)\s*\([^)]*\)\s*\{[^}]*$/);
		if (methodMatch) {
			return methodMatch[1];
		}

		return undefined;
	}
}
