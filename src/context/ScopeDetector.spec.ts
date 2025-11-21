import { ScopeDetector } from './ScopeDetector';

describe('ScopeDetector', () => {
	let detector: ScopeDetector;

	beforeEach(() => {
		detector = new ScopeDetector();
	});

	describe('detect', () => {
		it('should detect global scope', () => {
			const result = detector.detect('const x = 1;\n');

			expect(result.type).toBe('global');
			expect(result.depth).toBe(0);
		});

		it('should detect function scope', () => {
			const prefix = 'function foo() {\n  const x = 1;\n  ';

			const result = detector.detect(prefix);

			expect(result.type).toBe('function');
			expect(result.depth).toBe(1);
		});

		it('should detect class scope', () => {
			const prefix = 'class MyClass {\n  ';

			const result = detector.detect(prefix);

			expect(result.type).toBe('class');
			expect(result.depth).toBe(1);
		});

		it('should detect method scope', () => {
			const prefix = 'class MyClass {\n  myMethod() {\n    ';

			const result = detector.detect(prefix);

			expect(result.type).toBe('method');
			expect(result.depth).toBe(2);
		});

		it('should detect nested scope inside function', () => {
			const prefix = 'function foo() {\n  if (true) {\n    ';

			const result = detector.detect(prefix);

			// Nested block inside function - depth is 2
			expect(result.depth).toBe(2);
			// Type could be function or block - both are reasonable
			expect(['function', 'block']).toContain(result.type);
		});

		it('should detect array literal scope', () => {
			const prefix = 'const arr = [\n  1,\n  ';

			const result = detector.detect(prefix);

			expect(result.type).toBe('array');
			expect(result.balance.square).toBe(1);
		});

		it('should detect object literal scope', () => {
			const prefix = 'const obj = {\n  foo: 1,\n  bar: ';

			const result = detector.detect(prefix);

			expect(result.type).toBe('object');
			expect(result.depth).toBe(1);
		});

		it('should track bracket balance', () => {
			const prefix = 'function foo() { if (true) { const x = [1, 2';

			const result = detector.detect(prefix);

			expect(result.balance.curly).toBe(2);
			expect(result.balance.paren).toBe(0);
			expect(result.balance.square).toBe(1);
		});
	});

	describe('string and comment handling', () => {
		it('should detect when inside a string', () => {
			const prefix = 'const s = "hello ';

			const result = detector.detect(prefix);

			expect(result.inString).toBe(true);
		});

		it('should detect when inside a template string', () => {
			const prefix = 'const s = `hello ${';

			const result = detector.detect(prefix);

			expect(result.inString).toBe(true);
		});

		it('should detect when inside a comment', () => {
			const prefix = 'const x = 1; /* this is a ';

			const result = detector.detect(prefix);

			expect(result.inComment).toBe(true);
		});

		it('should not be confused by brackets in strings', () => {
			const prefix = 'const s = "{ [ ( )";\n';

			const result = detector.detect(prefix);

			expect(result.depth).toBe(0);
			expect(result.balance.curly).toBe(0);
			expect(result.balance.square).toBe(0);
			expect(result.balance.paren).toBe(0);
		});

		it('should ignore single-line comments', () => {
			const prefix = '// { [ (\nconst x = 1;\n';

			const result = detector.detect(prefix);

			expect(result.depth).toBe(0);
		});
	});

	describe('statement boundary detection', () => {
		it('should detect boundary after semicolon', () => {
			const result = detector.detect('const x = 1;', '');

			expect(result.atStatementBoundary).toBe(true);
		});

		it('should detect boundary after opening brace', () => {
			const result = detector.detect('function foo() {', '');

			expect(result.atStatementBoundary).toBe(true);
		});

		it('should detect boundary after closing brace', () => {
			const result = detector.detect('function foo() { }', '');

			expect(result.atStatementBoundary).toBe(true);
		});

		it('should detect boundary before opening brace', () => {
			const result = detector.detect('function foo()', ' {');

			expect(result.atStatementBoundary).toBe(true);
		});

		it('should not detect boundary mid-expression', () => {
			const result = detector.detect('const x = 1 +', ' 2');

			expect(result.atStatementBoundary).toBe(false);
		});
	});

	describe('container name extraction', () => {
		it('should extract function name', () => {
			const prefix = 'function myFunction() {\n  ';

			const result = detector.detect(prefix);

			expect(result.containerName).toBe('myFunction');
		});

		it('should extract arrow function name', () => {
			const prefix = 'const myArrow = () => {\n  ';

			const result = detector.detect(prefix);

			expect(result.containerName).toBe('myArrow');
		});

		it('should extract class name', () => {
			const prefix = 'class MyClass {\n  ';

			const result = detector.detect(prefix);

			expect(result.containerName).toBe('MyClass');
		});

		it('should return undefined for global scope', () => {
			const result = detector.detect('const x = 1;\n');

			expect(result.containerName).toBeUndefined();
		});
	});

	describe('isTopLevel', () => {
		it('should return true for global scope', () => {
			expect(detector.isTopLevel('const x = 1;\n')).toBe(true);
		});

		it('should return false inside function', () => {
			expect(detector.isTopLevel('function foo() {\n  ')).toBe(false);
		});
	});

	describe('isInFunction', () => {
		it('should return true inside function', () => {
			expect(detector.isInFunction('function foo() {\n  ')).toBe(true);
		});

		it('should return true inside method', () => {
			expect(
				detector.isInFunction('class X { method() {\n  ')
			).toBe(true);
		});

		it('should return false at global scope', () => {
			expect(detector.isInFunction('const x = 1;\n')).toBe(false);
		});
	});

	describe('getRecommendedMaxLines', () => {
		it('should return more lines for global scope', () => {
			const lines = detector.getRecommendedMaxLines('const x = 1;\n');

			expect(lines).toBe(20);
		});

		it('should return fewer lines for function scope', () => {
			const lines = detector.getRecommendedMaxLines('function foo() {\n  ');

			expect(lines).toBe(10);
		});

		it('should return very few lines for nested scope', () => {
			const lines = detector.getRecommendedMaxLines(
				'function foo() {\n  if (true) {\n    '
			);

			expect(lines).toBe(5);
		});

		it('should return 1 line when inside string', () => {
			const lines = detector.getRecommendedMaxLines('const s = "hello ');

			expect(lines).toBe(1);
		});

		it('should return 1 line when inside comment', () => {
			const lines = detector.getRecommendedMaxLines('/* comment ');

			expect(lines).toBe(1);
		});

		it('should return few lines for array literal', () => {
			const lines = detector.getRecommendedMaxLines('const arr = [\n  ');

			expect(lines).toBe(3);
		});
	});
});
