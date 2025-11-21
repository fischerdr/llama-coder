import { ContextBuilder } from './ContextBuilder';
import { createTokenBudget } from './Tokenizer';

describe('ContextBuilder', () => {
	describe('basic operations', () => {
		it('should build context with prefix and suffix', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				maxContextTokens: 10000,
			});

			const result = builder
				.setPrefix('function hello() {\n  return ')
				.setSuffix(';\n}')
				.build();

			expect(result.prefix).toBe('function hello() {\n  return ');
			expect(result.suffix).toBe(';\n}');
			expect(result.tokenCounts.total).toBeGreaterThan(0);
			expect(result.wasTruncated).toBe(false);
		});

		it('should handle empty context', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
			});

			const result = builder.build();

			expect(result.prefix).toBe('');
			expect(result.suffix).toBe('');
			expect(result.tokenCounts.total).toBe(0);
			expect(result.wasTruncated).toBe(false);
		});

		it('should support method chaining', () => {
			const builder = new ContextBuilder({ format: 'qwen' });

			const result = builder
				.setPrefix('prefix')
				.setSuffix('suffix')
				.addImports('import foo')
				.addDefinitions('type Bar = string')
				.build();

			expect(result.prefix).toBe('prefix');
			expect(result.suffix).toBe('suffix');
			expect(result.additional.length).toBe(2);
		});

		it('should reset builder state', () => {
			const builder = new ContextBuilder({ format: 'qwen' });

			builder.setPrefix('prefix').setSuffix('suffix');
			builder.reset();
			const result = builder.build();

			expect(result.prefix).toBe('');
			expect(result.suffix).toBe('');
		});
	});

	describe('truncation', () => {
		it('should truncate prefix when exceeding budget', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				budget: createTokenBudget(100, 20), // Small budget
			});

			// Create a long prefix
			const longPrefix = 'x'.repeat(1000);

			const result = builder.setPrefix(longPrefix).build();

			expect(result.prefix.length).toBeLessThan(longPrefix.length);
			expect(result.wasTruncated).toBe(true);
		});

		it('should truncate suffix when exceeding budget', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				budget: createTokenBudget(100, 20),
			});

			const longSuffix = 'y'.repeat(1000);

			const result = builder.setSuffix(longSuffix).build();

			expect(result.suffix.length).toBeLessThan(longSuffix.length);
			expect(result.wasTruncated).toBe(true);
		});

		it('should keep end of prefix (closest to cursor)', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				budget: createTokenBudget(100, 20),
			});

			const prefix = 'START_MARKER_' + 'x'.repeat(500) + '_END_MARKER';

			const result = builder.setPrefix(prefix).build();

			// Should keep the end (closest to cursor)
			expect(result.prefix).toContain('END_MARKER');
			expect(result.prefix).not.toContain('START_MARKER');
		});

		it('should keep beginning of suffix (closest to cursor)', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				budget: createTokenBudget(100, 20),
			});

			const suffix = 'START_MARKER_' + 'y'.repeat(500) + '_END_MARKER';

			const result = builder.setSuffix(suffix).build();

			// Should keep the beginning (closest to cursor)
			expect(result.suffix).toContain('START_MARKER');
			expect(result.suffix).not.toContain('END_MARKER');
		});
	});

	describe('additional context', () => {
		it('should add imports with high priority', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				maxContextTokens: 10000,
			});

			const result = builder
				.addImports('import { foo } from "bar"')
				.build();

			expect(result.additional.length).toBe(1);
			expect(result.additional[0].type).toBe('imports');
			expect(result.additional[0].priority).toBe(80);
		});

		it('should add definitions with medium-high priority', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				maxContextTokens: 10000,
			});

			const result = builder
				.addDefinitions('interface Foo { bar: string }')
				.build();

			expect(result.additional.length).toBe(1);
			expect(result.additional[0].type).toBe('definitions');
			expect(result.additional[0].priority).toBe(70);
		});

		it('should add related files with custom priority', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				maxContextTokens: 10000,
			});

			const result = builder
				.addRelated('related content', '/path/to/file.ts', 60)
				.build();

			expect(result.additional.length).toBe(1);
			expect(result.additional[0].type).toBe('related');
			expect(result.additional[0].priority).toBe(60);
			expect(result.additional[0].filePath).toBe('/path/to/file.ts');
		});

		it('should skip empty content', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				maxContextTokens: 10000,
			});

			const result = builder
				.addImports('')
				.addImports('   ')
				.addDefinitions('')
				.build();

			expect(result.additional.length).toBe(0);
		});

		it('should prioritize pieces by priority when space is limited', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
				budget: createTokenBudget(200, 50), // Very limited budget
			});

			const result = builder
				.setPrefix('short prefix')
				.setSuffix('short suffix')
				.addRelated('low priority content '.repeat(10), 'low.ts', 30)
				.addImports('import high priority') // priority 80
				.addDefinitions('type medium priority') // priority 70
				.build();

			// Should include high priority imports first
			const hasImports = result.additional.some((p) => p.type === 'imports');
			expect(hasImports).toBe(true);
		});
	});

	describe('token estimation', () => {
		it('should estimate tokens for current content', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
			});

			builder.setPrefix('function foo() {}').setSuffix('bar()');

			const estimate = builder.estimateTokens();

			expect(estimate.prefix.tokens).toBeGreaterThan(0);
			expect(estimate.suffix.tokens).toBeGreaterThan(0);
			expect(estimate.total).toBe(
				estimate.prefix.tokens + estimate.suffix.tokens
			);
		});

		it('should include additional pieces in estimation', () => {
			const builder = new ContextBuilder({
				format: 'qwen',
			});

			builder
				.setPrefix('prefix')
				.addImports('import { foo } from "bar"');

			const estimate = builder.estimateTokens();

			expect(estimate.additional.tokens).toBeGreaterThan(0);
		});
	});

	describe('budget access', () => {
		it('should return copy of budget', () => {
			const originalBudget = createTokenBudget(10000, 500);
			const builder = new ContextBuilder({
				format: 'qwen',
				budget: originalBudget,
			});

			const budget = builder.getBudget();

			expect(budget).toEqual(originalBudget);
			expect(budget).not.toBe(originalBudget); // Should be a copy
		});
	});

	describe('model formats', () => {
		it('should work with deepseek format', () => {
			const builder = new ContextBuilder({
				format: 'deepseek',
				maxContextTokens: 10000,
			});

			const result = builder
				.setPrefix('function test() {')
				.setSuffix('}')
				.build();

			expect(result.prefix).toBe('function test() {');
			expect(result.tokenCounts.prefix).toBeGreaterThan(0);
		});

		it('should use different default context for different models', () => {
			const qwenBuilder = new ContextBuilder({ format: 'qwen' });
			const deepseekBuilder = new ContextBuilder({ format: 'deepseek' });

			const qwenBudget = qwenBuilder.getBudget();
			const deepseekBudget = deepseekBuilder.getBudget();

			// Qwen has larger default context
			expect(qwenBudget.total).toBeGreaterThan(deepseekBudget.total);
		});
	});
});
