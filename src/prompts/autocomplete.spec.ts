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
        it('should strip <EOT> token from CodeLlama completions', async () => {
            // Mock token generator that returns completion with <EOT>
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'codellama', response: 'const x = 1', done: false };
                yield { model: 'codellama', response: ';<EOT>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
                prefix: 'const x = ',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('const x = 1;');
            expect(result).not.toContain('<EOT>');
        });

        it('should strip <END> token from CodeLlama completions', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'codellama', response: 'function foo() {', done: false };
                yield { model: 'codellama', response: ' return 42; }<END>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
                prefix: 'function foo() {',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('function foo() { return 42; }');
            expect(result).not.toContain('<END>');
        });

        it('should strip <EOD> token from CodeLlama completions', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'codellama', response: 'let y = 2<EOD>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
                prefix: 'let y = ',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('let y = 2');
            expect(result).not.toContain('<EOD>');
        });

        it('should strip <|endoftext|> token from Stable Code completions', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'stable-code', response: 'const z = 3;', done: false };
                yield { model: 'stable-code', response: '<|endoftext|>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'stable-code:3b',
                format: 'stable-code',
                prefix: 'const z = ',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('const z = 3;');
            expect(result).not.toContain('<|endoftext|>');
        });

        it('should strip <fim_prefix> token from Stable Code completions', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'stable-code', response: 'return true<fim_prefix>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'stable-code:3b',
                format: 'stable-code',
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
                yield { model: 'codellama', response: 'const endToken = "<EOT>"', done: false };
                yield { model: 'codellama', response: ';', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
                prefix: 'const endToken = ',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            expect(result).toBe('const endToken = "<EOT>";');
        });

        it('should handle completion with no stop tokens', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'codellama', response: 'return 123;', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
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
                yield { model: 'codellama', response: 'done<END>', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
                prefix: '',
                suffix: '',
                maxLines: 10,
                maxTokens: 100,
                temperature: 0.2
            });

            // Should strip <END> because it's at the end and in stop list
            expect(result).toBe('done');
            expect(result).not.toContain('<END>');
        });
    });

    describe('whitespace trimming', () => {
        it('should trim trailing spaces from lines', async () => {
            mockOllamaTokenGenerator.mockImplementation(async function* () {
                yield { model: 'codellama', response: 'line1  \nline2   \nline3    ', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
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
                yield { model: 'codellama', response: '  indented  ', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
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
                yield { model: 'codellama', response: 'line1\n', done: false };
                yield { model: 'codellama', response: 'line2\n', done: false };
                yield { model: 'codellama', response: 'line3\n', done: false };
                yield { model: 'codellama', response: 'line4\n', done: false };
                yield { model: 'codellama', response: 'line5\n', done: false };
                yield { model: 'codellama', response: 'line6', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
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
                yield { model: 'codellama', response: '{\n', done: false };
                yield { model: 'codellama', response: '  a: 1,\n', done: false };
                yield { model: 'codellama', response: '  b: 2,\n', done: false };
                yield { model: 'codellama', response: '  c: 3\n', done: false };
                yield { model: 'codellama', response: '}', done: true };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
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
                yield { model: 'codellama', response: 'before_cancel', done: false };
                shouldCancel = true;
                yield { model: 'codellama', response: '_after_cancel', done: false };
            });

            const result = await autocomplete({
                endpoint: 'http://localhost:11434',
                bearerToken: '',
                model: 'codellama:7b',
                format: 'codellama',
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
