/**
 * ResponseParser - Parses and validates AI model responses for rewrite operations
 *
 * Handles various response formats and extracts clean code from model output:
 * - Strips markdown code blocks
 * - Removes explanation text
 * - Validates code structure
 * - Preserves indentation
 */

import { info } from '../modules/log';

/**
 * Parse result containing the extracted code and metadata
 */
export interface ParseResult {
	/** The extracted/cleaned code */
	code: string;
	/** Whether the parse was successful */
	success: boolean;
	/** Error message if parsing failed */
	error?: string;
	/** Confidence score (0-1) based on parsing quality */
	confidence: number;
}

/**
 * ResponseParser class for extracting code from model responses
 */
export class ResponseParser {
	/**
	 * Parse a rewrite response from the model
	 */
	parseRewriteResponse(response: string, originalCode: string): ParseResult {
		if (!response || response.trim() === '') {
			return {
				code: '',
				success: false,
				error: 'Empty response from model',
				confidence: 0,
			};
		}

		let code = response;
		let confidence = 1.0;

		// Step 1: Remove markdown code blocks if present
		code = this.stripMarkdownCodeBlocks(code);

		// Step 2: Remove common model artifacts
		code = this.stripModelArtifacts(code);

		// Step 3: Remove explanation text before/after code
		code = this.extractCodeSection(code, originalCode);

		// Step 4: Validate the result
		const validation = this.validateCode(code, originalCode);
		if (!validation.valid) {
			confidence *= 0.5;
		}

		// Step 5: Preserve original indentation style
		code = this.normalizeIndentation(code, originalCode);

		// Calculate final confidence based on similarity to original
		confidence *= this.calculateSimilarityConfidence(code, originalCode);

		info(`Parsed rewrite response: ${code.length} chars, confidence: ${confidence.toFixed(2)}`);
		info(`Parsed code preview:\n${code.substring(0, 200)}${code.length > 200 ? '...' : ''}`);

		return {
			code: code.trim(),
			success: true,
			confidence,
		};
	}

	/**
	 * Strip markdown code blocks (```language ... ```)
	 */
	private stripMarkdownCodeBlocks(text: string): string {
		// Match ```language\n...\n``` or ```\n...\n```
		const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;
		const matches = text.match(codeBlockRegex);

		if (matches && matches.length > 0) {
			// Extract content from the first code block
			const match = codeBlockRegex.exec(text);
			if (match) {
				return match[1];
			}
			// Fallback: remove the backticks manually
			return text.replace(/```\w*\n?/g, '').replace(/```/g, '');
		}

		// Check if text starts with opening backticks but no closing (incomplete)
		if (text.trimStart().startsWith('```')) {
			// Remove opening backticks and optional language identifier
			text = text.replace(/^```\w*\n?/, '').trimStart();
		}

		// Check if text ends with closing backticks (incomplete close from stop token)
		if (text.trimEnd().endsWith('```')) {
			text = text.replace(/```\s*$/, '').trimEnd();
		}

		return text;
	}

	/**
	 * Strip common model artifacts and stop tokens
	 */
	private stripModelArtifacts(text: string): string {
		// DeepSeek tokens
		text = text.replace(/<｜fim▁begin｜>/g, '');
		text = text.replace(/<｜fim▁hole｜>/g, '');
		text = text.replace(/<｜fim▁end｜>/g, '');
		text = text.replace(/<｜end▁of▁sentence｜>/g, '');

		// Qwen tokens
		text = text.replace(/<\|fim_prefix\|>/g, '');
		text = text.replace(/<\|fim_suffix\|>/g, '');
		text = text.replace(/<\|fim_middle\|>/g, '');
		text = text.replace(/<\|endoftext\|>/g, '');
		text = text.replace(/<\|end\|>/g, '');

		// Common end tokens
		text = text.replace(/<\|eot_id\|>/g, '');
		text = text.replace(/<\/s>/g, '');

		return text;
	}

	/**
	 * Extract code section from response that may contain explanations
	 */
	private extractCodeSection(text: string, originalCode: string): string {
		const lines = text.split('\n');
		const codeLines: string[] = [];
		let inCodeSection = false;
		let foundCode = false;

		// Heuristic: Look for lines that look like code
		for (const line of lines) {
			// Skip context markers from prompt
			if (line.includes('// Context before (do not modify):') ||
				line.includes('// Context after (do not modify):') ||
				line.includes('// Code to rewrite:')) {
				continue;
			}

			// Skip common explanation patterns
			if (this.isExplanationLine(line) && !foundCode) {
				continue;
			}

			// Detect start of code (indented or contains code patterns)
			if (this.isCodeLine(line, originalCode)) {
				inCodeSection = true;
				foundCode = true;
			}

			if (inCodeSection) {
				// Stop if we hit explanation after code
				if (this.isExplanationLine(line) && codeLines.length > 0) {
					// Check if this might be a comment in code
					if (!this.looksLikeCodeComment(line)) {
						break;
					}
				}
				codeLines.push(line);
			}
		}

		// If we didn't find clear code, return original text
		if (codeLines.length === 0) {
			return text;
		}

		return codeLines.join('\n');
	}

	/**
	 * Check if a line looks like an explanation rather than code
	 */
	private isExplanationLine(line: string): boolean {
		const trimmed = line.trim().toLowerCase();

		// Common explanation starters
		const explanationPatterns = [
			/^here'?s?\s+(the|your|a)/i,
			/^i'?ve?\s+(made|changed|modified|updated|fixed)/i,
			/^this\s+(code|function|method)/i,
			/^the\s+(following|above|below)/i,
			/^note:/i,
			/^explanation:/i,
			/^changes:/i,
			/^output:/i,
			/^result:/i,
		];

		for (const pattern of explanationPatterns) {
			if (pattern.test(trimmed)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if a line looks like code
	 */
	private isCodeLine(line: string, originalCode: string): boolean {
		const trimmed = line.trim();

		// Empty lines can be part of code
		if (trimmed === '') {
			return false; // Don't start with empty line
		}

		// Check for common code patterns
		const codePatterns = [
			/^(import|export|from|const|let|var|function|class|interface|type|def|async|await|return|if|else|for|while|switch|case|try|catch|finally)\b/,
			/^(public|private|protected|static|readonly|abstract)\b/,
			/^[@#]/, // Decorators, preprocessor
			/[{}\[\]();:]$/, // Ends with code punctuation
			/^\s+/, // Indented (likely code continuation)
			/^\/\/|^\/\*|^#/, // Comments
		];

		for (const pattern of codePatterns) {
			if (pattern.test(trimmed) || pattern.test(line)) {
				return true;
			}
		}

		// Check if line is similar to original code structure
		const originalLines = originalCode.split('\n');
		for (const origLine of originalLines) {
			if (this.linesSimilar(line, origLine)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if a line looks like a code comment
	 */
	private looksLikeCodeComment(line: string): boolean {
		const trimmed = line.trim();
		return (
			trimmed.startsWith('//') ||
			trimmed.startsWith('#') ||
			trimmed.startsWith('/*') ||
			trimmed.startsWith('*') ||
			trimmed.startsWith('"""') ||
			trimmed.startsWith("'''")
		);
	}

	/**
	 * Check if two lines are similar
	 */
	private linesSimilar(a: string, b: string): boolean {
		const ta = a.trim().toLowerCase();
		const tb = b.trim().toLowerCase();

		if (ta === tb) {
			return true;
		}

		// Check for partial match (e.g., same function name)
		const wordsA = ta.split(/\s+/);
		const wordsB = tb.split(/\s+/);

		let matches = 0;
		for (const word of wordsA) {
			if (word.length > 2 && wordsB.includes(word)) {
				matches++;
			}
		}

		return matches >= 2 || (matches >= 1 && wordsA.length <= 3);
	}

	/**
	 * Validate extracted code
	 */
	private validateCode(code: string, originalCode: string): { valid: boolean; reason?: string } {
		// Check for balanced brackets
		const brackets = { '(': 0, '[': 0, '{': 0 };
		for (const char of code) {
			if (char === '(') { brackets['(']++; }
			if (char === ')') { brackets['(']--; }
			if (char === '[') { brackets['[']++; }
			if (char === ']') { brackets['[']--; }
			if (char === '{') { brackets['{']++; }
			if (char === '}') { brackets['{']--; }
		}

		for (const [bracket, count] of Object.entries(brackets)) {
			if (count !== 0) {
				return { valid: false, reason: `Unbalanced ${bracket}` };
			}
		}

		// Check code is not empty
		if (code.trim().length === 0) {
			return { valid: false, reason: 'Empty code' };
		}

		// Check it's not just the original code repeated with explanations
		if (code.length > originalCode.length * 3) {
			return { valid: false, reason: 'Response too long compared to original' };
		}

		return { valid: true };
	}

	/**
	 * Normalize indentation to match original code style
	 */
	private normalizeIndentation(code: string, originalCode: string): string {
		// Detect indentation style from original
		const originalIndent = this.detectIndentation(originalCode);
		const codeIndent = this.detectIndentation(code);

		if (originalIndent === codeIndent) {
			return code;
		}

		// Convert indentation
		const lines = code.split('\n');
		const normalizedLines = lines.map(line => {
			const leadingWhitespace = line.match(/^(\s*)/)?.[1] || '';
			const content = line.slice(leadingWhitespace.length);

			if (leadingWhitespace.length === 0) {
				return line;
			}

			// Count indent level
			let level = 0;
			if (codeIndent === 'tab') {
				level = leadingWhitespace.split('\t').length - 1;
			} else {
				// Assume 2 or 4 space indent
				const spaceCount = leadingWhitespace.length;
				level = Math.round(spaceCount / (codeIndent === 'space2' ? 2 : 4));
			}

			// Apply original indent style
			let newIndent = '';
			if (originalIndent === 'tab') {
				newIndent = '\t'.repeat(level);
			} else if (originalIndent === 'space2') {
				newIndent = '  '.repeat(level);
			} else {
				newIndent = '    '.repeat(level);
			}

			return newIndent + content;
		});

		return normalizedLines.join('\n');
	}

	/**
	 * Detect indentation style (tab, space2, space4)
	 */
	private detectIndentation(code: string): 'tab' | 'space2' | 'space4' {
		const lines = code.split('\n');
		let tabs = 0;
		let spaces2 = 0;
		let spaces4 = 0;

		for (const line of lines) {
			const match = line.match(/^(\s+)/);
			if (match) {
				const indent = match[1];
				if (indent.includes('\t')) {
					tabs++;
				} else if (indent.length % 4 === 0) {
					spaces4++;
				} else if (indent.length % 2 === 0) {
					spaces2++;
				}
			}
		}

		if (tabs > spaces2 && tabs > spaces4) {
			return 'tab';
		}
		if (spaces2 > spaces4) {
			return 'space2';
		}
		return 'space4';
	}

	/**
	 * Calculate confidence based on similarity to original code
	 */
	private calculateSimilarityConfidence(code: string, originalCode: string): number {
		// If code is identical, something might be wrong (no changes made)
		if (code.trim() === originalCode.trim()) {
			return 0.3; // Low confidence - no changes
		}

		// Calculate rough similarity ratio
		const shorter = Math.min(code.length, originalCode.length);
		const longer = Math.max(code.length, originalCode.length);
		const lengthRatio = shorter / longer;

		// Very different lengths suggest major changes or problems
		if (lengthRatio < 0.2) {
			return 0.4;
		}
		if (lengthRatio > 0.8 && lengthRatio < 1.2) {
			return 1.0; // Similar length is good
		}

		return 0.7;
	}
}

/**
 * Singleton instance
 */
let responseParserInstance: ResponseParser | null = null;

export function getResponseParser(): ResponseParser {
	if (!responseParserInstance) {
		responseParserInstance = new ResponseParser();
	}
	return responseParserInstance;
}
