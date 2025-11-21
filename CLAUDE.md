# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Llama Coder is a self-hosted VS Code extension that provides AI-powered code completion using local LLM inference servers (Ollama, vLLM, llama.cpp). It supports DeepSeek and Qwen models with Fill-In-Middle (FIM) prompting. The extension acts as a privacy-focused alternative to GitHub Copilot, running entirely on local hardware without telemetry.

**Key Features:**

- Inline code completion with smart replacement mode
- Structural code rewrite with diff preview
- Multiple inference backend support
- Token-aware context management
- Semantic caching for performance
- Jupyter notebook support

## Project Layout

```text
llama-coder/
├── src/
│   ├── extension.ts              # Extension entry point, activation logic
│   ├── config.ts                 # Configuration management
│   │
│   ├── backends/                 # Inference backend abstraction (NEW)
│   │   ├── IInferenceBackend.ts  # Backend interface
│   │   ├── OllamaBackend.ts      # Ollama implementation
│   │   ├── VLLMBackend.ts        # vLLM implementation
│   │   ├── LlamaCppBackend.ts    # llama.cpp implementation
│   │   ├── BackendFactory.ts     # Backend creation factory
│   │   └── RetryPolicy.ts        # Retry logic with exponential backoff
│   │
│   ├── context/                  # Context management (NEW)
│   │   ├── ContextBuilder.ts     # Token-aware context building
│   │   ├── SemanticCache.ts      # LRU cache with similarity matching
│   │   ├── SessionManager.ts     # KV cache session management
│   │   ├── Tokenizer.ts          # Tokenizer integration
│   │   └── WorkspaceIndex.ts     # Multi-file context (future)
│   │
│   ├── ui/                       # UI components (NEW)
│   │   ├── DiffPreviewManager.ts # Diff visualization and accept/reject
│   │   └── StatusBarManager.ts   # Status bar management
│   │
│   ├── commands/                 # Command handlers (NEW)
│   │   ├── rewriteCommands.ts    # Code rewrite commands
│   │   └── diagnosticCommands.ts # Diagnostic and statistics commands
│   │
│   ├── errors/                   # Error handling (NEW)
│   │   ├── ErrorHandler.ts       # Centralized error handling
│   │   └── FallbackStrategy.ts   # Graceful degradation
│   │
│   ├── telemetry/                # Usage tracking (NEW)
│   │   └── TelemetryService.ts   # Local-only telemetry
│   │
│   ├── modules/                  # Utility modules
│   │   ├── lock.ts               # AsyncLock for concurrency control
│   │   ├── log.ts                # Logging utilities
│   │   ├── text.ts               # Text manipulation utilities
│   │   ├── lineGenerator.ts      # [DEPRECATED] Move to backends
│   │   ├── ollamaCheckModel.ts   # [DEPRECATED] Move to OllamaBackend
│   │   ├── ollamaDownloadModel.ts # [DEPRECATED] Move to OllamaBackend
│   │   └── ollamaTokenGenerator.ts # [DEPRECATED] Move to OllamaBackend
│   │
│   └── prompts/                  # Prompt processing and completion
│       ├── AutocompleteProvider.ts  # InlineCompletionItemProvider (refactored)
│       ├── RewriteActionProvider.ts # CodeActionProvider for rewrites (NEW)
│       ├── LlamaCoderService.ts     # Unified service layer (NEW)
│       ├── PromptBuilder.ts         # Model-specific prompt building (NEW)
│       ├── ResponseParser.ts        # Response parsing and validation (NEW)
│       ├── ReplacementAnalyzer.ts   # Smart replacement logic (NEW)
│       ├── autocomplete.ts          # Main completion logic with streaming
│       ├── filter.ts                # Filters for when completions are needed
│       ├── preparePrompt.ts         # Context gathering from document
│       ├── promptCache.ts           # [DEPRECATED] Use SemanticCache
│       └── processors/              # Prompt transformation pipeline
│           ├── comment.ts           # Comment syntax handling
│           ├── detectLanguage.ts    # Language detection from file path
│           ├── fileHeaders.ts       # Inject file/language headers
│           ├── languages.ts         # Language definitions database
│           └── models.ts            # Model-specific FIM formatting
│
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md           # Current system architecture (comprehensive)
│   ├── AI_AUTOCOMPLETE_DESIGN_OUTLINE.md      # Design specification
│   ├── AI_AUTOCOMPLETE_IMPLEMENTATION_ROADMAP.md  # Implementation plan
│   ├── FIM_QWEN.md              # Qwen FIM format documentation
│   ├── LOCAL_SETUP_GUIDE.md     # Local development setup
│   └── TESTING_CHECKLIST.md     # Testing procedures
│
├── scripts/                      # Testing and utility scripts
│   ├── test-completions.sh      # Basic completion testing
│   ├── test-ansible-scenarios.sh # Ansible-specific tests
│   ├── test-helm-debug.sh       # Helm chart debugging tests
│   ├── test-python-scenarios.sh # Python-specific tests
│   └── test-summary.sh          # Test result summarization
│
├── out/                          # Compiled JavaScript output
├── package.json                  # Extension manifest and dependencies
├── tsconfig.json                 # TypeScript compiler configuration
├── jest.config.js                # Jest testing configuration
├── .eslintrc.json                # ESLint rules
├── CHANGELOG.md                  # Version history and major changes
├── CLAUDE.md                     # This file
├── DEVELOPMENT.md                # Development workflow guide
├── QUICK_TEST_GUIDE.md          # Quick testing reference
└── README.md                     # User-facing documentation
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

# Run integration tests with real scenarios
./scripts/test-completions.sh      # Basic completions
./scripts/test-python-scenarios.sh # Python-specific
./scripts/test-ansible-scenarios.sh # Ansible-specific
./scripts/test-summary.sh          # Generate summary
```

## Architecture

### Core Flow

1. **Extension Activation** ([extension.ts](src/extension.ts)): Registers providers and commands
2. **Autocomplete Provider** ([prompts/AutocompleteProvider.ts](src/prompts/AutocompleteProvider.ts)): Implements `InlineCompletionItemProvider`
3. **Rewrite Action Provider** ([prompts/RewriteActionProvider.ts](src/prompts/RewriteActionProvider.ts)): Implements `CodeActionProvider` for rewrites
4. **Context Building** ([context/ContextBuilder.ts](src/context/ContextBuilder.ts)): Token-aware context extraction
5. **Backend Communication** ([backends/](src/backends/)): Unified interface for Ollama/vLLM/llama.cpp
6. **Completion Logic** ([prompts/autocomplete.ts](src/prompts/autocomplete.ts)): Streaming with block stack tracking

### Key Components

**Configuration System** ([config.ts](src/config.ts))

Configuration organized by namespace:

- `inference.*` - Backend connection and model settings
- `completion.*` - Inline completion behavior
- `rewrite.*` - Code rewrite settings
- `advanced.*` - Advanced features (scope detection, parsers, sessions)
- `telemetry.*` - Local-only usage tracking (opt-in)
- `notebook.*` - Jupyter notebook-specific settings

**Backend Abstraction** ([backends/](src/backends/))

Unified `IInferenceBackend` interface supporting:

- **Ollama**: Full feature support including model download
- **vLLM**: OpenAI-compatible API with automatic KV caching
- **llama.cpp**: Custom protocol with explicit KV cache control

Each backend handles:

- Model availability checking
- Streaming completion requests
- Streaming rewrite requests
- Error handling and retries
- Format-specific prompt adaptation

**Context Management** ([context/](src/context/))

- **ContextBuilder**: Token-aware context extraction with scope detection
  - AST-based scope boundaries (function/class/file)
  - Import statement extraction
  - Intelligent truncation to token budget
  - Configurable allocation: 70% prefix, 20% suffix, 10% imports (completion mode)
- **SemanticCache**: LRU cache with multiple key strategies
  - Exact matching (whitespace-sensitive)
  - Normalized matching (whitespace/comments removed)
  - Semantic matching (embeddings-based, optional)
  - Max 1000 entries, 50MB size limit
- **SessionManager**: KV cache session reuse
  - 5-minute TTL per document
  - Automatic cleanup of expired sessions
  - Backend capability detection

#### Prompt Processing Pipeline

1. Language detection ([prompts/processors/detectLanguage.ts](src/prompts/processors/detectLanguage.ts))
2. File header injection ([prompts/processors/fileHeaders.ts](src/prompts/processors/fileHeaders.ts))
3. Model-specific prompt formatting ([prompts/processors/models.ts](src/prompts/processors/models.ts))
   - **DeepSeek**: `<｜fim▁begin｜>...<｜fim▁hole｜>...<｜fim▁end｜>`
   - **Qwen**: `<|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>`

#### Completion Logic

[prompts/autocomplete.ts](src/prompts/autocomplete.ts)

- Tracks bracket/paren/brace balance to avoid incomplete blocks
- Stops after `maxLines` when at top-level scope
- Strips model-specific stop tokens dynamically
- Trims trailing whitespace from all lines
- Supports smart replacement mode (optional)

#### Rewrite System (NEW)

- **RewriteActionProvider**: Provides "Rewrite with AI" actions in lightbulb menu
- **DiffPreviewManager**: Visual diff with decorations and accept/reject UI
- **PromptBuilder**: Model-specific instruction templates
- **ResponseParser**: Robust parsing of JSON and tagged XML formats

### State Management

**AsyncLock** ([modules/lock.ts](src/modules/lock.ts)): Ensures only one completion request runs at a time

**SemanticCache** ([context/SemanticCache.ts](src/context/SemanticCache.ts)): Replaces simple promptCache with LRU eviction

**Global State** (via `ExtensionContext.globalState`):

- `llama-coder-download-ignored`: Tracks which model downloads user declined
- `telemetry.events`: Local telemetry data (opt-in only)

### Notebook Support

The extension supports Jupyter notebooks with special handling:

- Aggregates all cells as context (prefix/suffix)
- Can include markdown cells as comments
- Optionally includes cell outputs as comments for better context
- See [preparePrompt.ts](src/prompts/preparePrompt.ts)

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

- **DeepSeek**: `<｜fim▁begin｜>prefix<｜fim▁hole｜>suffix<｜fim▁end｜>`
- **Qwen**: `<|fim_prefix|>prefix<|fim_suffix|>suffix<|fim_middle|>`

When adding new models, implement the format in [prompts/processors/models.ts](src/prompts/processors/models.ts).

**Note:** The project has been streamlined to focus on DeepSeek and Qwen models. CodeLlama and Stable Code formats remain for backward compatibility but are not actively maintained.

### Backend Abstraction Pattern

When adding a new inference backend:

1. Implement `IInferenceBackend` interface in `src/backends/`
2. Add backend type to `BackendFactory.create()` switch statement
3. Update configuration in `package.json` with new backend option
4. Add backend-specific prompt templates to `PromptBuilder`
5. Test with mock HTTP server in integration tests
6. Document backend-specific quirks in code comments

### Cancellation Handling

Completion requests check `token.isCancellationRequested` at multiple checkpoints:

- Before prompt preparation
- After prompt preparation
- After model check
- After model download
- During token streaming
- After completion

Always propagate `AbortSignal` through async operations for proper cancellation.

### Status Bar Updates

The status bar shows different states:

- `$(chip) Llama Coder`: Ready
- `$(sync~spin) Llama Coder`: Running inference
- `$(sync~spin) Downloading`: Downloading model
- `$(sync-ignored) Llama Coder`: Paused

Update status bar at key lifecycle points to provide user feedback.

### Error Handling Strategy

All errors should be handled through the `ErrorHandler` component:

- Categorize: network, model, parse, unknown
- Log with full context to output channel
- Show user-friendly messages
- Track in telemetry for debugging
- Provide recovery options (retry, fallback, cancel)

Never let errors crash the extension. Always fail gracefully.

## Extension Configuration

Configuration is organized by namespace:

### `inference.*` - Backend Settings

- `backend`: Inference backend type (ollama, vllm, llamacpp)
- `endpoint`: Server URL (default: `http://127.0.0.1:11434`)
- `bearerToken`: Authentication token (Ollama)
- `apiKey`: API key (vLLM)
- `model`: Selected model from predefined list or "custom"
- `temperature`: Sampling temperature (default: 0.2)
- `maxLines`: Maximum completion lines (default: 5)
- `maxTokens`: Maximum new tokens (default: 100)
- `delay`: Completion trigger delay in ms (default: 250, -1 disables)
- `timeout`: Request timeout (default: 30000ms)
- `retryAttempts`: Number of retry attempts (default: 3)

### `completion.*` - Inline Completion

- `enableReplacements`: Smart text replacement mode (default: false)
- `minConfidence`: Confidence threshold (default: 0.5)
- `contextWindow`: Max context tokens (default: 4096)
- `enableSemanticCache`: Semantic similarity caching (default: true)

### `rewrite.*` - Code Rewrite

- `contextWindow`: Max context tokens (default: 8192)
- `temperature`: Sampling temperature (default: 0.7)
- `showDiffPreview`: Show preview before apply (default: true)
- `autoAcceptThreshold`: Auto-accept confidence (default: 0.95, 0=never)

### `advanced.*` - Advanced Features

- `scopeDetection`: Scope level (none/function/class/file)
- `enableParserIntegration`: Use tree-sitter parsers (default: true)
- `enableSessionCache`: KV cache session reuse (default: true)
- `logLevel`: Logging verbosity (error/warn/info/debug)

### `telemetry.*` - Usage Tracking

- `enabled`: Enable local telemetry (default: false, opt-in only)

### `notebook.*` - Jupyter Notebooks

- `includeMarkup`: Include markdown cells as comments
- `includeCellOutputs`: Include cell outputs as comments
- `cellOutputLimit`: Max output chars per cell

## Testing Notes

### Test Organization

- **Unit tests**: Co-located with source files using `.spec.ts` extension
- **Integration tests**: `test/integration/*.spec.ts` (future)
- **Scenario tests**: Shell scripts in `scripts/` directory

### Running Tests

```bash
# All unit tests
yarn test

# Specific test file
npx jest src/prompts/processors/detectLanguage.spec.ts

# With coverage
yarn test --coverage

# Watch mode
yarn test --watch
```

### Scenario Testing

The `scripts/` directory contains real-world scenario tests:

- `test-completions.sh`: Basic completion scenarios across languages
- `test-python-scenarios.sh`: Python-specific patterns
- `test-ansible-scenarios.sh`: Ansible playbook completions
- `test-helm-debug.sh`: Helm chart debugging
- `test-summary.sh`: Generate test result summary

These scripts test the extension with actual code patterns and can be run manually or in CI.

### Expected Behavior

When Claude Code modifies files, it should:

1. Make the requested changes
2. Automatically run the appropriate quality tools based on file type
3. Fix any issues found by the tools
4. Report the results to the user

This ensures all code maintains consistent quality and follows project standards.

### Adding New Tests

When adding tests:

1. Create `.spec.ts` file next to the code being tested
2. Use descriptive test names: `should <expected behavior> when <condition>`
3. Test both happy path and edge cases
4. Mock external dependencies (HTTP, file system)
5. Aim for >80% code coverage for new code

## Changelog Management

### CHANGELOG.md Structure

The `CHANGELOG.md` file tracks all significant changes across versions. When making major updates:

1. **Create a section for the change** with clear hierarchy:

   ```markdown
   # Changelog: <Feature/Fix Name>

   **Branch:** `feature/branch-name`
   **Date:** YYYY-MM-DD
   **Type:** Feature/Bug Fix/Refactor/Documentation
   **Impact:** Description of user-facing changes
   ```

2. **Document all modified files** with before/after comparisons where relevant

3. **Include test coverage** - number of tests added, coverage percentage

4. **List performance impact** - expected improvements or regressions

5. **Note breaking changes** prominently at the top

6. **Track implementation status**:
   - Design phase
   - Implementation in progress
   - Testing
   - Ready for review
   - Merged to main

### Major Update Tracking

For large features (like the AI autocomplete enhancement):

1. **Reference design documents** in CHANGELOG.md:
   - Link to `docs/AI_AUTOCOMPLETE_DESIGN_OUTLINE.md`
   - Link to `docs/AI_AUTOCOMPLETE_IMPLEMENTATION_ROADMAP.md`

2. **Track phase completion** from roadmap:

   ```markdown
   ## Implementation Status

   - [x] Phase 1: Foundation (Week 1-2)
   - [ ] Phase 2: Enhanced Autocomplete (Week 3)
   - [ ] Phase 3: Structural Rewrite (Week 4-5)
   - [ ] Phase 4: Production Readiness (Week 6)
   - [ ] Phase 5: Advanced Features (Week 7-8)
   ```

3. **Update on each merge** to track progress

4. **Document migration path** for breaking changes

### Version Bumping

Follow semantic versioning:

- **Major** (x.0.0): Breaking changes
- **Minor** (0.x.0): New features, backward compatible
- **Patch** (0.0.x): Bug fixes

Update `package.json` version when merging to main.

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

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Good example:

```text
feat: add vLLM backend support

Implements IInferenceBackend for vLLM's OpenAI-compatible API with
automatic prefix caching support. Enables users to run completions
against vLLM-served models.
```

## Documentation

### docs/ Directory

The `docs/` directory contains technical documentation:

- **ARCHITECTURE.md**: Comprehensive current system architecture with flow diagrams
- **AI_AUTOCOMPLETE_DESIGN_OUTLINE.md**: Design specification for AI enhancement project
- **AI_AUTOCOMPLETE_IMPLEMENTATION_ROADMAP.md**: 8-week implementation plan with phases
- **FIM_QWEN.md**: Qwen model FIM format documentation
- **LOCAL_SETUP_GUIDE.md**: Local development environment setup
- **TESTING_CHECKLIST.md**: Manual testing procedures

### When to Update Documentation

Update documentation when:

- Adding new components or directories
- Changing architecture or design patterns
- Adding new configuration options
- Modifying public APIs or interfaces
- Completing major implementation phases

Cross-reference between documents using relative links.

## scripts/ Directory

The `scripts/` directory contains executable testing and utility scripts:

### Testing Scripts

- **test-completions.sh**: Basic completion testing across multiple languages
  - Tests TypeScript, Python, JavaScript, Go, Rust scenarios
  - Validates FIM prompt formatting
  - Checks completion quality

- **test-python-scenarios.sh**: Python-specific test cases
  - Function definitions
  - Class methods
  - Decorators
  - Type hints
  - Async/await patterns

- **test-ansible-scenarios.sh**: Ansible playbook completions
  - Task definitions
  - Handlers
  - Variables
  - Templates

- **test-helm-debug.sh**: Helm chart debugging scenarios
  - Chart templates
  - Values files
  - Helper functions

- **test-summary.sh**: Aggregates test results and generates summary report

### Script Conventions

When adding scripts:

1. Make them executable: `chmod +x scripts/script-name.sh`
2. Add shebang: `#!/bin/bash`
3. Include usage documentation at top of file
4. Exit with appropriate status codes
5. Log output for debugging
6. Support `--help` flag

### Moving Scripts

All testing scripts should live in `scripts/` directory, not project root. When adding new test scripts, create them directly in `scripts/`.

## Related Projects

This extension integrates with:

- **Ollama**: Local LLM serving <https://ollama.ai>
- **vLLM**: High-performance inference server <https://vllm.ai>
- **llama.cpp**: CPU-optimized inference <https://github.com/ggerganov/llama.cpp>

See respective documentation for server setup and model management.

## Performance Targets

When implementing or optimizing features, aim for these targets:

- **Inline Completion Latency**: <500ms p50, <2s p99
- **Rewrite Latency**: <3s p50, <10s p99
- **Cache Hit Rate**: >30% for repeated edits
- **Memory Usage**: <100MB for extension process
- **Context Building**: <50ms for typical file

Monitor telemetry to track against these targets.

## References

- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Design**: [docs/AI_AUTOCOMPLETE_DESIGN_OUTLINE.md](docs/AI_AUTOCOMPLETE_DESIGN_OUTLINE.md)
- **Roadmap**: [docs/AI_AUTOCOMPLETE_IMPLEMENTATION_ROADMAP.md](docs/AI_AUTOCOMPLETE_IMPLEMENTATION_ROADMAP.md)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)
- **Development**: [DEVELOPMENT.md](DEVELOPMENT.md)
