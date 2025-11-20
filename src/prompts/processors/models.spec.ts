import { adaptPrompt, ModelFormat } from './models';

describe('adaptPrompt', () => {
    describe('CodeLlama format', () => {
        it('should format prompt without extra spaces', () => {
            const result = adaptPrompt({
                format: 'codellama',
                prefix: 'function foo()',
                suffix: '}'
            });

            expect(result.prompt).toBe('<PRE>function foo()<SUF>}<MID>');
        });

        it('should include all CodeLlama stop tokens', () => {
            const result = adaptPrompt({
                format: 'codellama',
                prefix: 'const x = ',
                suffix: ';'
            });

            expect(result.stop).toEqual(['<END>', '<EOD>', '<EOT>']);
            expect(result.stop).toHaveLength(3);
        });

        it('should handle empty prefix', () => {
            const result = adaptPrompt({
                format: 'codellama',
                prefix: '',
                suffix: 'return x;'
            });

            expect(result.prompt).toBe('<PRE><SUF>return x;<MID>');
        });

        it('should handle empty suffix', () => {
            const result = adaptPrompt({
                format: 'codellama',
                prefix: 'function main() {',
                suffix: ''
            });

            expect(result.prompt).toBe('<PRE>function main() {<SUF><MID>');
        });

        it('should handle both empty prefix and suffix', () => {
            const result = adaptPrompt({
                format: 'codellama',
                prefix: '',
                suffix: ''
            });

            expect(result.prompt).toBe('<PRE><SUF><MID>');
        });

        it('should preserve multiline content', () => {
            const result = adaptPrompt({
                format: 'codellama',
                prefix: 'def foo():\n    x = 1\n    ',
                suffix: '\n    return x'
            });

            expect(result.prompt).toBe('<PRE>def foo():\n    x = 1\n    <SUF>\n    return x<MID>');
        });
    });

    describe('DeepSeek format', () => {
        it('should format prompt with correct tokens', () => {
            const result = adaptPrompt({
                format: 'deepseek',
                prefix: 'function bar()',
                suffix: '}'
            });

            expect(result.prompt).toBe('<｜fim▁begin｜>function bar()<｜fim▁hole｜>}<｜fim▁end｜>');
        });

        it('should include only DeepSeek-specific stop tokens', () => {
            const result = adaptPrompt({
                format: 'deepseek',
                prefix: 'const x = ',
                suffix: ';'
            });

            expect(result.stop).toEqual(['<｜fim▁begin｜>', '<｜fim▁hole｜>', '<｜fim▁end｜>']);
            expect(result.stop).toHaveLength(3);
        });

        it('should not include <END> token', () => {
            const result = adaptPrompt({
                format: 'deepseek',
                prefix: 'test',
                suffix: 'test'
            });

            expect(result.stop).not.toContain('<END>');
        });

        it('should handle empty prefix', () => {
            const result = adaptPrompt({
                format: 'deepseek',
                prefix: '',
                suffix: 'return x;'
            });

            expect(result.prompt).toBe('<｜fim▁begin｜><｜fim▁hole｜>return x;<｜fim▁end｜>');
        });

        it('should handle empty suffix', () => {
            const result = adaptPrompt({
                format: 'deepseek',
                prefix: 'class Test {',
                suffix: ''
            });

            expect(result.prompt).toBe('<｜fim▁begin｜>class Test {<｜fim▁hole｜><｜fim▁end｜>');
        });

        it('should preserve multiline content', () => {
            const result = adaptPrompt({
                format: 'deepseek',
                prefix: 'def bar():\n    y = 2\n    ',
                suffix: '\n    return y'
            });

            expect(result.prompt).toBe('<｜fim▁begin｜>def bar():\n    y = 2\n    <｜fim▁hole｜>\n    return y<｜fim▁end｜>');
        });
    });

    describe('Stable Code format', () => {
        it('should format prompt with correct tokens', () => {
            const result = adaptPrompt({
                format: 'stable-code',
                prefix: 'function baz()',
                suffix: '}'
            });

            expect(result.prompt).toBe('<fim_prefix>function baz()<fim_suffix>}<fim_middle>');
        });

        it('should include all Stable Code stop tokens', () => {
            const result = adaptPrompt({
                format: 'stable-code',
                prefix: 'const x = ',
                suffix: ';'
            });

            expect(result.stop).toEqual(['<|endoftext|>', '<fim_prefix>', '<fim_suffix>', '<fim_middle>']);
            expect(result.stop).toHaveLength(4);
        });

        it('should include endoftext token', () => {
            const result = adaptPrompt({
                format: 'stable-code',
                prefix: 'test',
                suffix: 'test'
            });

            expect(result.stop).toContain('<|endoftext|>');
        });

        it('should include fim format tokens in stop list', () => {
            const result = adaptPrompt({
                format: 'stable-code',
                prefix: 'test',
                suffix: 'test'
            });

            expect(result.stop).toContain('<fim_prefix>');
            expect(result.stop).toContain('<fim_suffix>');
            expect(result.stop).toContain('<fim_middle>');
        });

        it('should handle empty prefix', () => {
            const result = adaptPrompt({
                format: 'stable-code',
                prefix: '',
                suffix: 'return x;'
            });

            expect(result.prompt).toBe('<fim_prefix><fim_suffix>return x;<fim_middle>');
        });

        it('should handle empty suffix', () => {
            const result = adaptPrompt({
                format: 'stable-code',
                prefix: 'fn main() {',
                suffix: ''
            });

            expect(result.prompt).toBe('<fim_prefix>fn main() {<fim_suffix><fim_middle>');
        });

        it('should preserve multiline content', () => {
            const result = adaptPrompt({
                format: 'stable-code',
                prefix: 'fn baz() {\n    let z = 3;\n    ',
                suffix: '\n    z\n}'
            });

            expect(result.prompt).toBe('<fim_prefix>fn baz() {\n    let z = 3;\n    <fim_suffix>\n    z\n}<fim_middle>');
        });
    });

    describe('format comparison', () => {
        const testPrefix = 'function test() {';
        const testSuffix = '}';

        it('should generate different prompts for different formats', () => {
            const codellama = adaptPrompt({ format: 'codellama', prefix: testPrefix, suffix: testSuffix });
            const deepseek = adaptPrompt({ format: 'deepseek', prefix: testPrefix, suffix: testSuffix });
            const stableCode = adaptPrompt({ format: 'stable-code', prefix: testPrefix, suffix: testSuffix });

            expect(codellama.prompt).not.toBe(deepseek.prompt);
            expect(codellama.prompt).not.toBe(stableCode.prompt);
            expect(deepseek.prompt).not.toBe(stableCode.prompt);
        });

        it('should have different stop tokens for different formats', () => {
            const codellama = adaptPrompt({ format: 'codellama', prefix: testPrefix, suffix: testSuffix });
            const deepseek = adaptPrompt({ format: 'deepseek', prefix: testPrefix, suffix: testSuffix });
            const stableCode = adaptPrompt({ format: 'stable-code', prefix: testPrefix, suffix: testSuffix });

            expect(codellama.stop).not.toEqual(deepseek.stop);
            expect(codellama.stop).not.toEqual(stableCode.stop);
            expect(deepseek.stop).not.toEqual(stableCode.stop);
        });

        it('all formats should include prefix and suffix in prompt', () => {
            const formats: ModelFormat[] = ['codellama', 'deepseek', 'stable-code'];

            formats.forEach(format => {
                const result = adaptPrompt({ format, prefix: testPrefix, suffix: testSuffix });
                expect(result.prompt).toContain(testPrefix);
                expect(result.prompt).toContain(testSuffix);
            });
        });
    });
});
