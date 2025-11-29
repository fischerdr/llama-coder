/**
 * PromptBuilder - Builds model-specific prompts for rewrite operations
 *
 * Generates instruction prompts for code transformation tasks like:
 * - Refactoring
 * - Bug fixes
 * - Documentation addition
 * - Code optimization
 */

import { ModelFormat, adaptPrompt } from './processors/models';

/**
 * Rewrite instruction types
 */
export type RewriteInstruction =
	| 'refactor'
	| 'fix'
	| 'document'
	| 'optimize'
	| 'simplify'
	| 'custom';

/**
 * Rewrite request configuration
 */
export interface RewriteRequest {
	/** The code to rewrite */
	code: string;
	/** Type of rewrite instruction */
	instruction: RewriteInstruction;
	/** Custom instruction text (used when instruction is 'custom') */
	customInstruction?: string;
	/** Language of the code */
	language: string;
	/** Optional surrounding context (before the selection) */
	contextBefore?: string;
	/** Optional surrounding context (after the selection) */
	contextAfter?: string;
	/** Model format for prompt construction */
	format: ModelFormat;
}

/**
 * Instruction templates for different rewrite types
 */
const INSTRUCTION_TEMPLATES: Record<RewriteInstruction, string> = {
	refactor: 'Refactor the following {language} code to improve readability and maintainability. Keep the same functionality.',
	fix: 'Fix any bugs or issues in the following {language} code. Explain what was wrong if you find issues.',
	document: 'Add comprehensive documentation comments to the following {language} code. Include parameter descriptions and return value documentation.',
	optimize: 'Optimize the following {language} code for better performance. Preserve the original functionality.',
	simplify: 'Simplify the following {language} code while maintaining the same behavior. Remove unnecessary complexity.',
	custom: '{customInstruction}',
};

/**
 * System prompt for rewrite operations
 */
const REWRITE_SYSTEM_PROMPT = `You are a code assistant that rewrites code based on instructions.
Output ONLY the rewritten code without any explanations, markdown formatting, or code blocks.
Do not include \`\`\` markers or language identifiers.
Preserve indentation and formatting style of the original code.`;

/**
 * PromptBuilder class for generating rewrite prompts
 */
export class PromptBuilder {
	/**
	 * Build a rewrite prompt for the given request
	 */
	buildRewritePrompt(request: RewriteRequest): string {
		const instruction = this.buildInstruction(request);

		// For instruction-following, we use a different approach than FIM
		// We build a prompt that asks the model to rewrite the code
		// Just use the code itself without context markers to avoid confusion
		const prompt = this.buildInstructionPrompt(instruction, request.code, request.format);

		return prompt;
	}

	/**
	 * Build the instruction text
	 */
	private buildInstruction(request: RewriteRequest): string {
		let template = INSTRUCTION_TEMPLATES[request.instruction];

		// Replace placeholders
		template = template.replace('{language}', request.language);
		if (request.customInstruction) {
			template = template.replace('{customInstruction}', request.customInstruction);
		}

		return template;
	}

	/**
	 * Build code with surrounding context
	 */
	private buildContextualCode(request: RewriteRequest): string {
		const parts: string[] = [];

		if (request.contextBefore) {
			parts.push(`// Context before (do not modify):\n${request.contextBefore}\n`);
		}

		parts.push(`// Code to rewrite:\n${request.code}`);

		if (request.contextAfter) {
			parts.push(`\n// Context after (do not modify):\n${request.contextAfter}`);
		}

		return parts.join('\n');
	}

	/**
	 * Build instruction-following prompt based on model format
	 */
	private buildInstructionPrompt(instruction: string, code: string, format: ModelFormat): string {
		// For rewrites, we use a simple prompt that doesn't rely on FIM
		// The model should complete with the rewritten code
		// We use a format that encourages the model to output complete code
		const fullPrompt = `${instruction}

IMPORTANT: Only rewrite the exact code shown below. Do not add surrounding context or additional lines.

Original code:
\`\`\`
${code}
\`\`\`

Rewritten code (same scope, no extra context):
\`\`\`
`;

		return fullPrompt;
	}

	/**
	 * Build a FIM-style rewrite prompt for inline modifications
	 * This is used when we want the model to complete code in context
	 */
	buildFIMRewritePrompt(
		prefix: string,
		selectedCode: string,
		suffix: string,
		instruction: string,
		format: ModelFormat
	): string {
		// Add the instruction as a comment before the selection point
		const instructionComment = `// AI: ${instruction}\n`;
		const modifiedPrefix = prefix + instructionComment;

		// Use standard FIM format
		const adapted = adaptPrompt({ format, prefix: modifiedPrefix, suffix });
		return adapted.prompt;
	}
}

/**
 * Singleton instance
 */
let promptBuilderInstance: PromptBuilder | null = null;

export function getPromptBuilder(): PromptBuilder {
	if (!promptBuilderInstance) {
		promptBuilderInstance = new PromptBuilder();
	}
	return promptBuilderInstance;
}
