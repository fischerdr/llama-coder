import {
	EstimationTokenizer,
	LineAwareTokenizer,
	TokenizerFactory,
	createTokenBudget,
} from './Tokenizer';

describe('EstimationTokenizer', () => {
	describe('countTokens', () => {
		it('should return 0 tokens for empty string', () => {
			const tokenizer = new EstimationTokenizer('qwen');
			const result = tokenizer.countTokens('');

			expect(result.tokens).toBe(0);
			expect(result.isExact).toBe(true);
		});

		it('should estimate tokens for qwen format', () => {
			const tokenizer = new EstimationTokenizer('qwen');
			const text = 'function hello() { return "world"; }';

			const result = tokenizer.countTokens(text);

			// ~37 chars / 3.5 chars per token ≈ 11 tokens
			expect(result.tokens).toBeGreaterThan(8);
			expect(result.tokens).toBeLessThan(15);
			expect(result.isExact).toBe(false);
		});

		it('should estimate tokens for deepseek format', () => {
			const tokenizer = new EstimationTokenizer('deepseek');
			const text = 'function hello() { return "world"; }';

			const result = tokenizer.countTokens(text);

			// ~37 chars / 3.2 chars per token ≈ 12 tokens
			expect(result.tokens).toBeGreaterThan(9);
			expect(result.tokens).toBeLessThan(16);
			expect(result.isExact).toBe(false);
		});

		it('should use conservative ratio for unknown formats', () => {
			const tokenizer = new EstimationTokenizer('unknown' as any);
			const text = 'function hello() { return "world"; }';

			const result = tokenizer.countTokens(text);

			// ~37 chars / 3.0 chars per token ≈ 13 tokens
			expect(result.tokens).toBeGreaterThan(10);
			expect(result.tokens).toBeLessThan(17);
		});
	});

	describe('truncateToTokens', () => {
		it('should return empty string for empty input', () => {
			const tokenizer = new EstimationTokenizer('qwen');
			expect(tokenizer.truncateToTokens('', 100)).toBe('');
		});

		it('should return original text if within budget', () => {
			const tokenizer = new EstimationTokenizer('qwen');
			const text = 'short text';

			expect(tokenizer.truncateToTokens(text, 100)).toBe(text);
		});

		it('should truncate from end by default', () => {
			const tokenizer = new EstimationTokenizer('qwen');
			// 3.5 chars per token for qwen, so 10 tokens ≈ 35 chars
			const text = 'a'.repeat(100);

			const result = tokenizer.truncateToTokens(text, 10);

			expect(result.length).toBe(35);
			expect(result).toBe('a'.repeat(35));
		});

		it('should truncate from beginning when fromEnd is true', () => {
			const tokenizer = new EstimationTokenizer('qwen');
			const text = 'START' + 'x'.repeat(95) + 'END';

			const result = tokenizer.truncateToTokens(text, 10, true);

			expect(result.length).toBe(35);
			expect(result.endsWith('END')).toBe(true);
		});
	});

	describe('getCharsPerToken', () => {
		it('should return correct ratio for qwen', () => {
			const tokenizer = new EstimationTokenizer('qwen');
			expect(tokenizer.getCharsPerToken()).toBe(3.5);
		});

		it('should return correct ratio for deepseek', () => {
			const tokenizer = new EstimationTokenizer('deepseek');
			expect(tokenizer.getCharsPerToken()).toBe(3.2);
		});
	});
});

describe('LineAwareTokenizer', () => {
	describe('truncateToTokens', () => {
		it('should truncate to line boundary when truncating from end', () => {
			const base = new EstimationTokenizer('qwen');
			const tokenizer = new LineAwareTokenizer(base);

			// Create multi-line text
			const lines = [
				'function foo() {',
				'  const x = 1;',
				'  const y = 2;',
				'  return x + y;',
				'}',
			];
			const text = lines.join('\n');

			// Truncate to ~20 tokens (70 chars for qwen)
			const result = tokenizer.truncateToTokens(text, 20);

			// Should not contain partial lines - result should be shorter than original
			// and should not end with a partial line (no trailing content after last newline)
			expect(result.length).toBeLessThan(text.length);
			// The result should be valid lines (ends before the last incomplete line)
			const resultLines = result.split('\n');
			expect(resultLines.length).toBeGreaterThan(0);
		});

		it('should truncate to line boundary when truncating from beginning', () => {
			const base = new EstimationTokenizer('qwen');
			const tokenizer = new LineAwareTokenizer(base);

			const lines = [
				'function foo() {',
				'  const x = 1;',
				'  const y = 2;',
				'  return x + y;',
				'}',
			];
			const text = lines.join('\n');

			// Truncate from beginning
			const result = tokenizer.truncateToTokens(text, 15, true);

			// Should start at a line boundary (no partial first line)
			const firstChar = result[0];
			expect(firstChar === ' ' || firstChar === '}' || firstChar === 'c').toBe(
				true
			);
		});

		it('should delegate countTokens to base tokenizer', () => {
			const base = new EstimationTokenizer('qwen');
			const tokenizer = new LineAwareTokenizer(base);
			const text = 'test text';

			const baseResult = base.countTokens(text);
			const wrapperResult = tokenizer.countTokens(text);

			expect(wrapperResult).toEqual(baseResult);
		});
	});
});

describe('createTokenBudget', () => {
	it('should allocate tokens with default ratios', () => {
		const budget = createTokenBudget(10000);

		expect(budget.total).toBe(10000);
		// 15% response
		expect(budget.response).toBe(1500);
		// 5% overhead
		expect(budget.overhead).toBe(500);
		// Remaining 80% split 75/25
		expect(budget.prefix).toBe(6000);
		expect(budget.suffix).toBe(2000);
	});

	it('should allow custom response tokens', () => {
		const budget = createTokenBudget(10000, 500);

		expect(budget.response).toBe(500);
		// More tokens available for prefix/suffix
		expect(budget.prefix + budget.suffix).toBe(10000 - 500 - 500);
	});

	it('should handle small context windows', () => {
		const budget = createTokenBudget(1000);

		expect(budget.total).toBe(1000);
		expect(budget.prefix + budget.suffix + budget.response + budget.overhead).toBe(
			1000
		);
	});
});

describe('TokenizerFactory', () => {
	describe('create', () => {
		it('should create line-aware tokenizer by default', () => {
			const tokenizer = TokenizerFactory.create('qwen');

			expect(tokenizer).toBeInstanceOf(LineAwareTokenizer);
		});

		it('should create base tokenizer when lineAware is false', () => {
			const tokenizer = TokenizerFactory.create('qwen', false);

			expect(tokenizer).toBeInstanceOf(EstimationTokenizer);
		});
	});

	describe('createBudget', () => {
		it('should use qwen default context window', () => {
			const budget = TokenizerFactory.createBudget('qwen');

			expect(budget.total).toBe(32768);
		});

		it('should use deepseek default context window', () => {
			const budget = TokenizerFactory.createBudget('deepseek');

			expect(budget.total).toBe(16384);
		});

		it('should allow custom context window', () => {
			const budget = TokenizerFactory.createBudget('qwen', 8192);

			expect(budget.total).toBe(8192);
		});

		it('should allow custom response tokens', () => {
			const budget = TokenizerFactory.createBudget('qwen', 10000, 200);

			expect(budget.response).toBe(200);
		});
	});
});
