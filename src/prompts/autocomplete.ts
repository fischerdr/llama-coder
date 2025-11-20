import { ollamaTokenGenerator } from '../modules/ollamaTokenGenerator';
import { countSymbol } from '../modules/text';
import { info } from '../modules/log';
import { ModelFormat, adaptPrompt } from './processors/models';

export async function autocomplete(args: {
    endpoint: string,
    bearerToken: string,
    model: string,
    format: ModelFormat,
    prefix: string,
    suffix: string,
    maxLines: number,
    maxTokens: number,
    temperature: number,
    canceled?: () => boolean,
}): Promise<string> {

    let prompt = adaptPrompt({ prefix: args.prefix, suffix: args.suffix, format: args.format });

    // Log the formatted FIM prompt
    info('=== FIM Prompt Details ===');
    info(`Model Format: ${args.format}`);
    info(`Prefix length: ${args.prefix.length} chars`);
    info(`Suffix length: ${args.suffix.length} chars`);
    info(`Formatted prompt length: ${prompt.prompt.length} chars`);
    info(`Stop tokens: ${JSON.stringify(prompt.stop)}`);
    info('First 200 chars of formatted prompt:');
    info(prompt.prompt.substring(0, 200));
    info('Last 200 chars of formatted prompt:');
    info(prompt.prompt.substring(Math.max(0, prompt.prompt.length - 200)));

    // Calculate arguments
    let data = {
        model: args.model,
        prompt: prompt.prompt,
        raw: true,
        options: {
            stop: prompt.stop,
            num_predict: args.maxTokens,
            temperature: args.temperature
        }
    };

    // Log the complete request payload
    info('=== Ollama API Request ===');
    info(`Endpoint: ${args.endpoint}/api/generate`);
    info(`Model: ${args.model}`);
    info(`Temperature: ${args.temperature}`);
    info(`Max Tokens: ${args.maxTokens}`);
    info(`Request payload: ${JSON.stringify({ ...data, prompt: `[${data.prompt.length} chars]` }, null, 2)}`);

    // Receiving tokens
    info('=== Starting Token Stream ===');
    let res = '';
    let totalLines = 1;
    let blockStack: ('[' | '(' | '{')[] = [];
    let tokenCount = 0;
    outer: for await (let tokens of ollamaTokenGenerator(args.endpoint + '/api/generate', data, args.bearerToken)) {
        tokenCount++;
        if (args.canceled && args.canceled()) {
            break;
        }

        // Block stack
        for (let c of tokens.response) {

            // Open block
            if (c === '[') {
                blockStack.push('[');
            } else if (c === '(') {
                blockStack.push('(');
            }
            if (c === '{') {
                blockStack.push('{');
            }

            // Close block
            if (c === ']') {
                if (blockStack.length > 0 && blockStack[blockStack.length - 1] === '[') {
                    blockStack.pop();
                } else {
                    info('Block stack error, breaking.');
                    break outer;
                }
            }
            if (c === ')') {
                if (blockStack.length > 0 && blockStack[blockStack.length - 1] === '(') {
                    blockStack.pop();
                } else {
                    info('Block stack error, breaking.');
                    break outer;
                }
            }
            if (c === '}') {
                if (blockStack.length > 0 && blockStack[blockStack.length - 1] === '{') {
                    blockStack.pop();
                } else {
                    info('Block stack error, breaking.');
                    break outer;
                }
            }

            // Append charater
            res += c;
        }

        // Update total lines
        totalLines += countSymbol(tokens.response, '\n');
        // Break if too many lines and on top level
        if (totalLines > args.maxLines && blockStack.length === 0) {
            info('Too many lines, breaking.');
            break;
        }
    }

    // Remove any stop tokens from the end
    for (const stopToken of prompt.stop) {
        if (res.endsWith(stopToken)) {
            res = res.slice(0, res.length - stopToken.length);
            break;
        }
    }

    // Trim ends of all lines since sometimes the AI completion will add extra spaces
    res = res.split('\n').map((v) => v.trimEnd()).join('\n');

    // Log the final completion result
    info('=== Completion Result ===');
    info(`Total tokens received: ${tokenCount}`);
    info(`Total lines generated: ${totalLines}`);
    info(`Final block stack depth: ${blockStack.length}`);
    info(`Completion length: ${res.length} chars`);
    info(`Number of lines in result: ${res.split('\n').length}`);
    info('Complete result:');
    info(res);
    info('=== End of Completion ===');

    return res;
}