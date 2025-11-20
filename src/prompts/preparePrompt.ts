import vscode from 'vscode';
import { detectLanguage } from './processors/detectLanguage';
import { fileHeaders } from './processors/fileHeaders';
import { languages } from './processors/languages';
import { config } from '../config';
import { info } from '../modules/log';

var decoder = new TextDecoder("utf8");

function getNotebookDocument(document: vscode.TextDocument): vscode.NotebookDocument | undefined  {
    return  vscode.workspace.notebookDocuments
        .find(x => x.uri.path === document.uri.path);
}

export async function preparePrompt(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext) {

    info('=== Prepare Prompt Context ===');
    info(`File: ${document.uri.fsPath}`);
    info(`Language ID: ${document.languageId}`);
    info(`Cursor position: Line ${position.line}, Column ${position.character}`);

    // Load document text
    let text = document.getText();
    let offset = document.offsetAt(position);
    let prefix = text.slice(0, offset);
    let suffix: string = text.slice(offset);

    info(`Document total length: ${text.length} chars`);
    info(`Raw prefix length: ${prefix.length} chars`);
    info(`Raw suffix length: ${suffix.length} chars`);

    let notebookConfig = config.notebook;

    // If this is a notebook, add the surrounding cells to the prefix and suffix
    let notebookDocument = getNotebookDocument(document);
    let language = detectLanguage(document.uri.fsPath, document.languageId);
    let commentStart: string | undefined = undefined;
    if (language) {
        commentStart = languages[language].comment?.start;
        info(`Detected language: ${language}`);
        info(`Comment start syntax: ${commentStart || 'none'}`);
    } else {
        info('Could not detect language');
    }

    if (notebookDocument) {
        info(`Notebook detected with ${notebookDocument.getCells().length} cells`);
        let beforeCurrentCell = true;

        let prefixCells = "";
        let suffixCells = "";

        notebookDocument.getCells().forEach((cell) => {
            let out = "";

            if (cell.document.uri.fragment === document.uri.fragment) {
                beforeCurrentCell = false; // switch to suffix mode
                return;
            }
            
            // add the markdown cell output to the prompt as a comment
            if (cell.kind === vscode.NotebookCellKind.Markup && commentStart) {
                if (notebookConfig.includeMarkup) {
                    for (const line of cell.document.getText().split('\n')) {
                        out += `\n${commentStart}${line}`;
                    }
                }
            } else {
                out += cell.document.getText();
            }

            // if there is any outputs add them to the prompt as a comment
            const addCellOutputs = notebookConfig.includeCellOutputs
                                    && beforeCurrentCell
                                    && cell.kind === vscode.NotebookCellKind.Code
                                    && commentStart;
            if (addCellOutputs) {
                let cellOutputs = cell.outputs
                    .map(x => x.items
                                .filter(x => x.mime === 'text/plain')
                                .map(x => decoder.decode(x.data))
                                .map(x => x.slice(0, notebookConfig.cellOutputLimit).split('\n')))
                    .flat(3);
                
                if (cellOutputs.length > 0) {
                    out += `\n${commentStart}Output:`;
                    for (const line of cellOutputs) {
                        out += `\n${commentStart}${line}`;
                    }
                }
            }

            // update the prefix/suffix
            if (beforeCurrentCell) {
                prefixCells += out;
            } else {
                suffixCells += out;
            }

        });

        prefix = prefixCells + prefix;
        suffix = suffix + suffixCells;
        info(`After notebook aggregation - prefix: ${prefix.length} chars, suffix: ${suffix.length} chars`);
    }

    // Intelligently truncate prefix and suffix to prevent context overload
    let inferenceConfig = config.inference;

    // Truncate prefix if needed
    if (inferenceConfig.maxPrefixLength > 0 && prefix.length > inferenceConfig.maxPrefixLength) {
        let originalLength = prefix.length;
        prefix = prefix.substring(prefix.length - inferenceConfig.maxPrefixLength);
        // Try to start at a newline for cleaner context
        let firstNewline = prefix.indexOf('\n');
        if (firstNewline > 0 && firstNewline < inferenceConfig.maxPrefixLength * 0.3) {
            prefix = prefix.substring(firstNewline + 1);
        }
        info(`Prefix truncated from ${originalLength} to ${prefix.length} chars`);
    }

    // Truncate suffix if needed
    if (inferenceConfig.maxSuffixLength > 0 && suffix.length > inferenceConfig.maxSuffixLength) {
        let originalLength = suffix.length;
        let truncated = suffix.substring(0, inferenceConfig.maxSuffixLength);
        // Try to break at a newline for cleaner context
        let lastNewline = truncated.lastIndexOf('\n');
        if (lastNewline > inferenceConfig.maxSuffixLength * 0.7) {
            suffix = truncated.substring(0, lastNewline);
        } else {
            suffix = truncated;
        }
        info(`Suffix truncated from ${originalLength} to ${suffix.length} chars`);
    }

    // Add filename and language to prefix
    // NOTE: Most networks don't have a concept of filenames and expected language, but we expect that some files in training set has something in title that
    //       would indicate filename and language
    // NOTE: If we can't detect language, we could ignore this since the number of languages that need detection is limited
    if (language) {
        prefix = fileHeaders(prefix, document.uri.fsPath, languages[language]);
        info(`After file headers - prefix: ${prefix.length} chars`);
    }

    // Log prefix/suffix samples
    info('Prefix last 150 chars:');
    info(prefix.substring(Math.max(0, prefix.length - 150)));
    info('Suffix first 150 chars:');
    info(suffix.substring(0, 150));
    info('=== End Prepare Prompt ===');

    return {
        prefix,
        suffix,
    };
}