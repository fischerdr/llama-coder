import { adaptPrompt, ModelFormat } from './models';

describe('adaptPrompt', () => {
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

        it('should not include endoftext token', () => {
            const result = adaptPrompt({
                format: 'deepseek',
                prefix: 'test',
                suffix: 'test'
            });

            expect(result.stop).not.toContain('<|endoftext|>');
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

        it('should handle both empty prefix and suffix', () => {
            const result = adaptPrompt({
                format: 'deepseek',
                prefix: '',
                suffix: ''
            });

            expect(result.prompt).toBe('<｜fim▁begin｜><｜fim▁hole｜><｜fim▁end｜>');
        });
    });

    describe('Qwen format', () => {
        it('should format prompt with correct tokens', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: 'function baz()',
                suffix: '}'
            });

            expect(result.prompt).toBe('<|fim_prefix|>function baz()<|fim_suffix|>}<|fim_middle|>');
        });

        it('should include all Qwen stop tokens', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: 'const x = ',
                suffix: ';'
            });

            expect(result.stop).toEqual(['<|endoftext|>', '<|fim_prefix|>', '<|fim_suffix|>', '<|fim_middle|>']);
            expect(result.stop).toHaveLength(4);
        });

        it('should include endoftext token', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: 'test',
                suffix: 'test'
            });

            expect(result.stop).toContain('<|endoftext|>');
        });

        it('should include fim format tokens in stop list', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: 'test',
                suffix: 'test'
            });

            expect(result.stop).toContain('<|fim_prefix|>');
            expect(result.stop).toContain('<|fim_suffix|>');
            expect(result.stop).toContain('<|fim_middle|>');
        });

        it('should handle empty prefix', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: '',
                suffix: 'return x;'
            });

            expect(result.prompt).toBe('<|fim_prefix|><|fim_suffix|>return x;<|fim_middle|>');
        });

        it('should handle empty suffix', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: 'fn main() {',
                suffix: ''
            });

            expect(result.prompt).toBe('<|fim_prefix|>fn main() {<|fim_suffix|><|fim_middle|>');
        });

        it('should preserve multiline content', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: 'fn baz() {\n    let z = 3;\n    ',
                suffix: '\n    z\n}'
            });

            expect(result.prompt).toBe('<|fim_prefix|>fn baz() {\n    let z = 3;\n    <|fim_suffix|>\n    z\n}<|fim_middle|>');
        });

        it('should handle both empty prefix and suffix', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: '',
                suffix: ''
            });

            expect(result.prompt).toBe('<|fim_prefix|><|fim_suffix|><|fim_middle|>');
        });

        it('should preserve special characters in code', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: 'const regex = /[a-z]+/',
                suffix: 'console.log(regex);'
            });

            expect(result.prompt).toBe('<|fim_prefix|>const regex = /[a-z]+/<|fim_suffix|>console.log(regex);<|fim_middle|>');
        });

        it('should handle YAML/Ansible content', () => {
            const result = adaptPrompt({
                format: 'qwen',
                prefix: '- name: Configure service\n  ansible.builtin.service:\n    name: mysvc\n    ',
                suffix: '\n    enabled: true'
            });

            expect(result.prompt).toContain('<|fim_prefix|>');
            expect(result.prompt).toContain('<|fim_suffix|>');
            expect(result.prompt).toContain('<|fim_middle|>');
            expect(result.prompt).toContain('ansible.builtin.service');
        });
    });

    describe('format comparison', () => {
        const testPrefix = 'function test() {';
        const testSuffix = '}';

        it('should generate different prompts for different formats', () => {
            const deepseek = adaptPrompt({ format: 'deepseek', prefix: testPrefix, suffix: testSuffix });
            const qwen = adaptPrompt({ format: 'qwen', prefix: testPrefix, suffix: testSuffix });

            expect(deepseek.prompt).not.toBe(qwen.prompt);
        });

        it('should have different stop tokens for different formats', () => {
            const deepseek = adaptPrompt({ format: 'deepseek', prefix: testPrefix, suffix: testSuffix });
            const qwen = adaptPrompt({ format: 'qwen', prefix: testPrefix, suffix: testSuffix });

            expect(deepseek.stop).not.toEqual(qwen.stop);
        });

        it('all formats should include prefix and suffix in prompt', () => {
            const formats: ModelFormat[] = ['deepseek', 'qwen'];

            formats.forEach(format => {
                const result = adaptPrompt({ format, prefix: testPrefix, suffix: testSuffix });
                expect(result.prompt).toContain(testPrefix);
                expect(result.prompt).toContain(testSuffix);
            });
        });

        it('DeepSeek should use unique tokens', () => {
            const result = adaptPrompt({ format: 'deepseek', prefix: testPrefix, suffix: testSuffix });

            expect(result.prompt).toContain('<｜fim▁begin｜>');
            expect(result.prompt).toContain('<｜fim▁hole｜>');
            expect(result.prompt).toContain('<｜fim▁end｜>');
        });

        it('Qwen should use standard FIM tokens', () => {
            const result = adaptPrompt({ format: 'qwen', prefix: testPrefix, suffix: testSuffix });

            expect(result.prompt).toContain('<|fim_prefix|>');
            expect(result.prompt).toContain('<|fim_suffix|>');
            expect(result.prompt).toContain('<|fim_middle|>');
        });
    });
});
