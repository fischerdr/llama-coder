# Llama Coder

Llama Coder is a better and self-hosted Github Copilot replacement for [VS Code](https://github.com/microsoft/vscode). Llama Coder uses [Ollama](https://ollama.ai) and codellama to provide autocomplete that runs on your hardware. Works best with Mac M1/M2/M3 or with RTX 4090.

[VS Code Plugin](https://marketplace.visualstudio.com/items?itemName=ex3ndr.llama-coder)

## Features

- 🚀 As good as Copilot
- ⚡️ Fast. Works well on consumer GPUs. Apple Silicon or RTX 4090 is recommended for best performance.
- 🔐 No telemetry or tracking
- 🔬 Works with any language coding or human one.

## Recommended hardware

Minimum required RAM: 16GB is a minimum, more is better since even smallest model takes 5GB of RAM.
The best way: dedicated machine with RTX 4090. Install [Ollama](https://ollama.ai) on this machine and configure endpoint in extension settings to offload to this machine.
Second best way: run on MacBook M1/M2/M3 with enough RAM (more == better, but 10gb extra would be enough).
For windows notebooks: it runs good with decent GPU, but dedicated machine with a good GPU is recommended. Perfect if you have a dedicated gaming PC.

## Local Installation

Install [Ollama](https://ollama.ai) on local machine and then launch the extension in VSCode, everything should work as it is.

## Remote Installation

Install [Ollama](https://ollama.ai) on dedicated machine and configure endpoint to it in extension settings. Ollama usually uses port 11434 and binds to `127.0.0.1`, to change it you should set `OLLAMA_HOST` to `0.0.0.0`.

## Models

Llama Coder now supports **DeepSeek Coder** and **Qwen Coder** models, both optimized for code completion tasks. Models are quantized for efficiency - `q4_K_M` and `q5_K_M` provide the best balance of speed and quality. The default is `qwen2.5-coder:7b` which offers excellent performance across 40+ languages with 32K context window.

### DeepSeek Coder Models

Trained on 2T tokens (87% code, 13% natural language). Supports 16K context.

| Name                           | RAM/VRAM | Notes |
| ------------------------------ | -------- | ----- |
| deepseek-coder:1.3b-base-q4_0  | 1GB      | Fastest, lowest resource usage |
| deepseek-coder:6.7b-base-q4_K_M | 4GB     | Good balance of speed/quality |
| deepseek-coder:6.7b-base-q5_K_M | 5GB     | Better quality, slightly slower |
| deepseek-coder:33b-base-q4_K_M  | 20GB    | Highest quality, requires powerful GPU |

### Qwen Coder Models

Trained on massive datasets with superior multi-language support. Qwen2.5 supports 32K context, Qwen3 supports 256K context.

| Name                    | RAM/VRAM | Context | Notes |
| ----------------------- | -------- | ------- | ----- |
| qwen2.5-coder:0.5b      | 0.4GB    | 32K     | Ultra-lightweight for low-end systems |
| qwen2.5-coder:1.5b      | 1GB      | 32K     | Excellent for laptops |
| qwen2.5-coder:3b        | 2GB      | 32K     | Good speed/quality balance |
| qwen2.5-coder:7b        | 5GB      | 32K     | **Default** - Best overall performance |
| qwen2.5-coder:14b       | 9GB      | 32K     | High quality for capable systems |
| qwen2.5-coder:32b       | 20GB     | 32K     | Premium quality, powerful GPU required |
| qwen3-coder:30b         | 19GB     | 256K    | MoE architecture, ultra-long context |

**Recommendation**: Start with `qwen2.5-coder:7b` (default). Use larger models if you have more VRAM and want better quality. Use smaller models for faster completions on limited hardware.

### Configuration Tips

The extension defaults to focused, single-statement completions:

- `maxLines: 5` - Completes the current statement plus a few surrounding lines
- `maxTokens: 100` - Keeps completions fast and on-point

For longer multi-line completions, increase these values in settings:

- `maxLines: 10-30` for complete function bodies
- `maxTokens: 256-512` for comprehensive blocks

## Troubleshooting

Most of the problems could be seen in output of a plugin in VS Code extension output.

## Changelog

## [0.0.14]

- Ability to pause completition (by @bkyle)

- Bearer token support for remote inference (by @Sinan-Karakaya)

## [0.0.13]

- Fix remote files support

## [0.0.12]

- Remote support

- Fix codellama prompt preparation
- Add trigger delay
- Add jupyter notebooks support

## [0.0.11]

- Added Stable Code model

- Pause download only for specific model instead of all models

## [0.0.10]

- Adding ability to pick a custom model

- Asking user if they want to download model if it is not available

## [0.0.9]

- Adding deepseek 1b model and making it default

## [0.0.8]

- Improved DeepSeek support and language detection

## [0.0.7]

- Added DeepSeek support

- Ability to change temperature and top p
- Fixed some bugs

## [0.0.6]

- Fix ollama links

- Added more models

## [0.0.4]

- Initial release of Llama Coder
