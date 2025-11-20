# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Llama Coder is a self-hosted VS Code extension that provides AI-powered code completion using Ollama and local LLM models (CodeLlama, DeepSeek, Stable Code). It acts as a privacy-focused alternative to GitHub Copilot, running entirely on local hardware without telemetry.

## Project Layout

```text
llama-coder/
├── src/
│   ├── extension.ts              # Extension entry point, activation logic
│   ├── config.ts                 # Configuration management
│   ├── modules/                  # Utility modules
│   │   ├── lineGenerator.ts      # Streams lines from HTTP responses
│   │   ├── lock.ts               # AsyncLock for concurrency control
│   │   ├── log.ts                # Logging utilities
│   │   ├── ollamaCheckModel.ts   # Check if model exists on server
│   │   ├── ollamaDownloadModel.ts # Download models from Ollama
│   │   ├── ollamaTokenGenerator.ts # Stream tokens from Ollama API
│   │   └── text.ts               # Text manipulation utilities
│   └── prompts/                  # Prompt processing and completion
│       ├── autocomplete.ts       # Main completion logic with streaming
│       ├── filter.ts             # Filters for when completions are needed
│       ├── preparePrompt.ts      # Context gathering from document
│       ├── promptCache.ts        # Caches completions by prefix/suffix
│       ├── provider.ts           # VSCode InlineCompletionItemProvider
│       └── processors/           # Prompt transformation pipeline
│           ├── comment.ts        # Comment syntax handling
│           ├── detectLanguage.ts # Language detection from file path
│           ├── fileHeaders.ts    # Inject file/language headers
│           ├── languages.ts      # Language definitions database
│           └── models.ts         # Model-specific FIM formatting
├── out/                          # Compiled JavaScript output
├── package.json                  # Extension manifest and dependencies
├── tsconfig.json                 # TypeScript compiler configuration
├── jest.config.js                # Jest testing configuration
└── .eslintrc.json                # ESLint rules
```

## Essential Commands

### Development

```bash
# Install dependencies
yarn install

# Compile TypeScript
yarn compile

# Watch mode for development
yarn watch

# Lint code
yarn lint

# Run tests
yarn test

# Package extension for distribution
yarn package
```

### Testing

```bash
# Run all tests
yarn test

# Run specific test file
npx jest src/prompts/processors/detectLanguage.spec.ts
```

## Architecture

### Core Flow

1. **Extension Activation** ([extension.ts:5](src/extension.ts#L5)): Registers the inline completion provider and status bar commands
2. **Completion Provider** ([prompts/provider.ts](src/prompts/provider.ts)): Implements `vscode.InlineCompletionItemProvider` interface
3. **Prompt Preparation** ([prompts/preparePrompt.ts](src/prompts/preparePrompt.ts)): Builds context from document prefix/suffix, handles notebook cells
4. **Autocomplete** ([prompts/autocomplete.ts](src/prompts/autocomplete.ts)): Streams tokens from Ollama API and manages completion logic

### Key Components

**Configuration System** ([config.ts](src/config.ts))

- Centralizes VSCode workspace configuration access
- Manages inference settings (endpoint, model, temperature, etc.)
- Handles notebook-specific settings

**Prompt Processing Pipeline**

1. Language detection ([prompts/processors/detectLanguage.ts](src/prompts/processors/detectLanguage.ts))
2. File header injection ([prompts/processors/fileHeaders.ts](src/prompts/processors/fileHeaders.ts))
3. Model-specific prompt formatting ([prompts/processors/models.ts](src/prompts/processors/models.ts))
   - Supports 3 FIM (Fill-In-Middle) formats: CodeLlama, DeepSeek, Stable Code

**Ollama Integration**

- [ollamaTokenGenerator.ts](src/modules/ollamaTokenGenerator.ts): Streams JSON tokens from Ollama API
- [ollamaCheckModel.ts](src/modules/ollamaCheckModel.ts): Verifies model availability
- [ollamaDownloadModel.ts](src/modules/ollamaDownloadModel.ts): Handles model downloads with user consent

**Completion Logic** ([prompts/autocomplete.ts](src/prompts/autocomplete.ts))

- Tracks bracket/paren/brace balance to avoid incomplete blocks
- Stops after `maxLines` when at top-level scope
- Strips model-specific end tokens (`<EOT>`)
- Trims trailing whitespace from all lines

### State Management

**AsyncLock** ([modules/lock.ts](src/modules/lock.ts)): Ensures only one completion request runs at a time

**Prompt Cache** ([prompts/promptCache.ts](src/prompts/promptCache.ts)): Caches completions by prefix/suffix to avoid duplicate API calls

**Global State** (via `ExtensionContext.globalState`):

- `llama-coder-download-ignored`: Tracks which model downloads user declined

### Notebook Support

The extension supports Jupyter notebooks with special handling:

- Aggregates all cells as context (prefix/suffix)
- Can include markdown cells as comments
- Optionally includes cell outputs as comments for better context
- See [preparePrompt.ts:32-89](src/prompts/preparePrompt.ts#L32-L89)

## Communication Style

When working with this codebase, maintain a formal, professional tone appropriate for enterprise environments. Emphasize maintainability, clarity, and operational soundness in all changes.

### Documentation Standards

**IMPORTANT:** Follow these rules when working with documentation:

- **No emojis or icons** - Documentation must be professional and text-only
- **Ask before creating** - Always ask the user for approval before generating or modifying documentation files
- **No unsolicited documentation** - Never proactively create README files, markdown documentation, or similar without explicit user request

This applies to all documentation including:

- README files
- Markdown documentation (*.md)
- Code comments and docstrings (emojis prohibited)
- Commit messages (emojis prohibited)

## Important Patterns

### FIM (Fill-In-Middle) Prompting

Each model uses different special tokens to denote prefix/suffix/middle:

- **CodeLlama**: `<PRE> prefix <SUF> suffix <MID>`
- **DeepSeek**: `<｜fim▁begin｜>prefix<｜fim▁hole｜>suffix<｜fim▁end｜>`
- **Stable Code**: `<fim_prefix>prefix<fim_suffix>suffix<fim_middle>`

When adding new models, implement the format in [prompts/processors/models.ts](src/prompts/processors/models.ts).

### Cancellation Handling

Completion requests check `token.isCancellationRequested` at multiple checkpoints:

- Before prompt preparation
- After prompt preparation
- After model check
- After model download
- During token streaming
- After completion

### Status Bar Updates

The status bar shows different states:

- `$(chip) Llama Coder`: Ready
- `$(sync~spin) Llama Coder`: Running inference
- `$(sync~spin) Downloading`: Downloading model
- `$(sync-ignored) Llama Coder`: Paused

## Extension Configuration

All configuration uses the `inference.*` namespace (defined in [package.json:73-163](package.json#L73-L163)):

- `endpoint`: Ollama server URL (default: `http://127.0.0.1:11434`)
- `bearerToken`: Authentication token for remote Ollama instances
- `model`: Selected model from predefined list or "custom"
- `temperature`: Sampling temperature (default: 0.2)
- `maxLines`: Maximum completion lines (default: 16)
- `maxTokens`: Maximum new tokens (default: 256)
- `delay`: Completion trigger delay in ms (default: 250, -1 disables)

## Testing Notes

- Tests use Jest with ts-jest preset
- Test files use `.spec.ts` extension
- Currently only one test file exists: [detectLanguage.spec.ts](src/prompts/processors/detectLanguage.spec.ts)
- When adding tests, follow the existing pattern and ensure they're in the same directory as the code being tested

### Expected Behavior

When Claude Code modifies files, it should:

1. Make the requested changes
2. Automatically run the appropriate quality tools based on file type
3. Fix any issues found by the tools
4. Report the results to the user

This ensures all code maintains consistent quality and follows project standards.

## Git Commit Messages

**IMPORTANT:** Do NOT add Claude Code attribution or co-authorship to commit messages.

Commit messages should:

- Follow conventional commit format when appropriate
- Be concise and descriptive
- Focus on the "why" rather than the "what"
- Match the repository's existing commit style
- **NOT include** any Claude Code branding, attribution, or co-authorship footers

Bad example (DO NOT USE):

```text
Add new feature

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Good example:

```text
Add etcd defragmentation monitoring

Implements health check validation before and after defrag operations
to ensure cluster stability.
```
