import { isNotNeeded, isSupported } from './filter';

// Mock VSCode types
const mockDocument = (languageId: string, lineText: string, scheme: string = 'file') => ({
    languageId,
    lineAt: () => ({ text: lineText }),
    uri: { scheme }
} as any);

const mockPosition = { line: 0 } as any;

const mockContext = (hasSelection: boolean = false) => ({
    selectedCompletionInfo: hasSelection ? { range: {} } : undefined
} as any);

describe('isSupported', () => {
    it('should support file scheme', () => {
        const doc = mockDocument('typescript', 'const x = 1', 'file');
        expect(isSupported(doc)).toBe(true);
    });

    it('should support vscode-notebook-cell scheme', () => {
        const doc = mockDocument('python', 'print("hello")', 'vscode-notebook-cell');
        expect(isSupported(doc)).toBe(true);
    });

    it('should support vscode-remote scheme', () => {
        const doc = mockDocument('javascript', 'console.log()', 'vscode-remote');
        expect(isSupported(doc)).toBe(true);
    });

    it('should not support other schemes', () => {
        const doc = mockDocument('typescript', 'const x = 1', 'untrusted');
        expect(isSupported(doc)).toBe(false);
    });
});

describe('isNotNeeded', () => {
    describe('empty line filtering', () => {
        it('should return true for completely empty line', () => {
            const doc = mockDocument('typescript', '');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true for line with only spaces', () => {
            const doc = mockDocument('typescript', '    ');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true for line with only tabs', () => {
            const doc = mockDocument('typescript', '\t\t\t');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true for line with mixed whitespace', () => {
            const doc = mockDocument('typescript', '  \t  \t  ');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return false for line with content', () => {
            const doc = mockDocument('typescript', 'const x = 1');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });

        it('should return false for line with content and leading whitespace', () => {
            const doc = mockDocument('typescript', '    const x = 1');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });
    });

    describe('autocomplete menu filtering', () => {
        it('should return true when selectedCompletionInfo exists', () => {
            const doc = mockDocument('typescript', 'const x = 1');
            const context = mockContext(true);
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return false when selectedCompletionInfo is undefined', () => {
            const doc = mockDocument('typescript', 'const x = 1');
            const context = mockContext(false);
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });
    });

    describe('language-based filtering', () => {
        it('should return true for markdown files', () => {
            const doc = mockDocument('markdown', '# Heading');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true for plaintext files', () => {
            const doc = mockDocument('plaintext', 'some text');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true for diff files', () => {
            const doc = mockDocument('diff', '+ added line');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true for log files', () => {
            const doc = mockDocument('log', '[INFO] message');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true for git-commit files', () => {
            const doc = mockDocument('git-commit', 'fix: something');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true for git-rebase files', () => {
            const doc = mockDocument('git-rebase', 'pick abc123');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return false for typescript files', () => {
            const doc = mockDocument('typescript', 'const x = 1');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });

        it('should return false for javascript files', () => {
            const doc = mockDocument('javascript', 'const x = 1');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });

        it('should return false for python files', () => {
            const doc = mockDocument('python', 'x = 1');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });

        it('should return false for java files', () => {
            const doc = mockDocument('java', 'int x = 1;');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });

        it('should return false for go files', () => {
            const doc = mockDocument('go', 'x := 1');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });

        it('should return false for rust files', () => {
            const doc = mockDocument('rust', 'let x = 1;');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });
    });

    describe('combined conditions', () => {
        it('should return true when line is empty even if language is supported', () => {
            const doc = mockDocument('typescript', '');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true when menu is shown even if language is supported', () => {
            const doc = mockDocument('python', 'x = 1');
            const context = mockContext(true);
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return true when language is unsupported even if line has content', () => {
            const doc = mockDocument('markdown', '# Valid heading');
            const context = mockContext();
            expect(isNotNeeded(doc, mockPosition, context)).toBe(true);
        });

        it('should return false when all conditions are favorable', () => {
            const doc = mockDocument('typescript', 'const x = 1');
            const context = mockContext(false);
            expect(isNotNeeded(doc, mockPosition, context)).toBe(false);
        });
    });
});
