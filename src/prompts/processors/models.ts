export type ModelFormat = 'deepseek' | 'qwen';

export function adaptPrompt(args: { format: ModelFormat, prefix: string, suffix: string }): { prompt: string, stop: string[] } {

    // DeepSeek FIM
    if (args.format === 'deepseek') {
        return {
            prompt: `<｜fim▁begin｜>${args.prefix}<｜fim▁hole｜>${args.suffix}<｜fim▁end｜>`,
            stop: [`<｜fim▁begin｜>`, `<｜fim▁hole｜>`, `<｜fim▁end｜>`]
        };
    }

    // Qwen FIM (default)
    return {
        prompt: `<|fim_prefix|>${args.prefix}<|fim_suffix|>${args.suffix}<|fim_middle|>`,
        stop: [`<|endoftext|>`, `<|fim_prefix|>`, `<|fim_suffix|>`, `<|fim_middle|>`]
    };
}