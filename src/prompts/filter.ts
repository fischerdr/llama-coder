import type vscode from 'vscode';

export function isSupported(doc: vscode.TextDocument) {
    return doc.uri.scheme === 'file' || doc.uri.scheme === 'vscode-notebook-cell' || doc.uri.scheme === 'vscode-remote';
}

export function isNotNeeded(doc: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext): boolean {

    // Avoid autocomplete on empty lines
    const line = doc.lineAt(position.line).text;
    if (line.trim() === '') {
        return true;
    }

    // Avoid autocomplete when system menu is shown (ghost text is hidden anyway)
    if (context.selectedCompletionInfo) {
        return true;
    }

    // Avoid autocomplete for unsupported file types
    const unsupportedLanguages = ['markdown', 'plaintext', 'diff', 'log', 'git-commit', 'git-rebase'];
    if (unsupportedLanguages.includes(doc.languageId)) {
        return true;
    }

    return false;
}