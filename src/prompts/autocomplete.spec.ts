import { autocomplete } from './autocomplete';
import { ollamaTokenGenerator } from '../modules/ollamaTokenGenerator';

// Mock the ollamaTokenGenerator module
jest.mock('../modules/ollamaTokenGenerator');

const mockOllamaTokenGenerator = ollamaTokenGenerator as jest.MockedFunction<typeof ollamaTokenGenerator>;

describe('autocomplete', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('stop token stripping', () => {
        it('should strip <|endoftext|> token from Qwen completions', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: 'const z = 3;', done: false };
                yield { model: 'qwen', response: '<|endoftext|>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: 'const z = ',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('const z = 3;');
            expect(result).not.toContain('<|endoftext|>');
        });

        it('should strip <fim_prefix> token from Qwen completions', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: 'return true<fim_prefix>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: '',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('return true');
            expect(result).not.toContain('<fim_prefix>');
        });

        it('should strip DeepSeek FIM tokens', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'deepseek', response: 'x = 42<｜fim▁begin｜>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'deepseek-coder:6.7b',
                format: 'deepseek',
                prefix: 'x = ',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('x = 42');
            expect(result).not.toContain('<｜fim▁begin｜>');
        });

        it('should not strip stop tokens that appear in middle of text', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: 'const endToken = "<|endoftext|>"', done: false };
                yield { model: 'qwen', response: ';', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: 'const endToken = ',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('const endToken = "<|endoftext|>";');
        });

        it('should handle completion with no stop tokens', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: 'return 123;', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: '',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('return 123;');
        });

        it('should only strip the first matching stop token from end', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: 'done<|endoftext|>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: '',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            // Should strip <|endoftext|> because it's at the end and in stop list
            expect(result).toBe('done');
            expect(result).not.toContain('<|endoftext|>');
        });
    });

    describe('whitespace trimming', () => {
        it('should trim trailing spaces from lines', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: 'line1  \nline2   \nline3    ', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: '',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('line1\nline2\nline3');
        });

        it('should preserve leading whitespace', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: '  indented  ', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: '',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('  indented');
        });
    });

    describe('block stack and max lines', () => {
        it('should stop at max lines when stack is empty', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: 'line1\n', done: false };
                yield { model: 'qwen', response: 'line2\n', done: false };
                yield { model: 'qwen', response: 'line3\n', done: false };
                yield { model: 'qwen', response: 'line4\n', done: false };
                yield { model: 'qwen', response: 'line5\n', done: false };
                yield { model: 'qwen', response: 'line6', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: '',
                suffix: '',
                maxLines: 3,
                maxTokens: 100,
                temperature: 0.2
            });

            const lineCount = result.split('\n').length;
            expect(lineCount).toBeLessThanOrEqual(4); // maxLines + 1 (started at line 1)
        });

        it('should continue past max lines when inside brackets', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: '{\n', done: false };
                yield { model: 'qwen', response: '  a: 1,\n', done: false };
                yield { model: 'qwen', response: '  b: 2,\n', done: false };
                yield { model: 'qwen', response: '  c: 3\n', done: false };
                yield { model: 'qwen', response: '}', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: '',
                suffix: '',
                maxLines: 2,
                maxTokens: 100,
                temperature: 0.2
            });

            // Should include all lines to close the bracket
            expect(result).toContain('}');
            expect(result.split('\n').length).toBeGreaterThan(2);
        });
    });

    describe('cancellation', () => {
        it('should stop when canceled', async () => {
            let shouldCancel = false;

            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'qwen', response: 'before_cancel', done: false };
                shouldCancel = true;
                yield { model: 'qwen', response: '_after_cancel', done: false };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'qwen2.5-coder:7b',
                format: 'qwen',
                prefix: '',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2,
                canceled: () => shouldCancel
            });

            expect(result).toBe('before_cancel');
            expect(result).not.toContain('after_cancel');
        });
    });
});
