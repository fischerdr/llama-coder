import vscode from 'vscode';
import { ModelFormat } from './prompts/processors/models';

class Config {

    // Inference
    get inference() {
        let config = this.#config;

        // Load endpoint
        let endpoint = (config.get('endpoint') as string).trim();
        if (endpoint.endsWith('/')) {
            endpoint = endpoint.slice(0, endpoint.length - 1).trim();
        }
        if (endpoint === '') {
            endpoint = 'http://127.0.0.1:11434';
        }
        let bearerToken = config.get('bearerToken') as string;

        // Load general paremeters
        let maxLines = config.get('maxLines') as number;
        let maxTokens = config.get('maxTokens') as number;
        let temperature = config.get('temperature') as number;
        let maxSuffixLength = config.get('maxSuffixLength') as number;
        let maxPrefixLength = config.get('maxPrefixLength') as number;

        // Load model
        let modelName = config.get('model') as string;
        let modelFormat: ModelFormat = 'qwen';
        if (modelName === 'custom') {
            modelName = config.get('custom.model') as string;
            modelFormat = config.get('custom.format') as ModelFormat;
        } else {
            if (modelName.startsWith('deepseek-coder')) {
                modelFormat = 'deepseek';
            } else if (modelName.startsWith('qwen')) {
                modelFormat = 'qwen';
            }
        }

        let delay = config.get('delay') as number;

        return {
            endpoint,
            bearerToken,
            maxLines,
            maxTokens,
            temperature,
            maxSuffixLength,
            maxPrefixLength,
            modelName,
            modelFormat,
            delay
        };
    }

    // Completion
    get completion() {
        let config = vscode.workspace.getConfiguration('completion');

        let enableReplacements = config.get('enableReplacements') as boolean;
        let minConfidence = config.get('minConfidence') as number;
        return {
            enableReplacements,
            minConfidence,
        };
    }

    // Notebook
    get notebook() {
        let config = vscode.workspace.getConfiguration('notebook');

        let includeMarkup = config.get('includeMarkup') as boolean;
        let includeCellOutputs = config.get('includeCellOutputs') as boolean;
        let cellOutputLimit = config.get('cellOutputLimit') as number;
        return {
            includeMarkup,
            includeCellOutputs,
            cellOutputLimit,
        };
    }

    get #config() {
        return vscode.workspace.getConfiguration('inference');
    };
}

export const config = new Config();