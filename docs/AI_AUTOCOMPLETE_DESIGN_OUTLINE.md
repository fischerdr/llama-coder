# AI-Assisted Autocomplete and Inline-Rewrite System Design Outline

## Overview

This document outlines the architectural design for enhancing Llama Coder with two integrated capabilities:

1. **Enhanced Inline Completion** - Character-level predictive completion with improved context awareness
2. **Structural Rewrite with Diff Awareness** - Intelligent multi-line code restructuring with visual diff preview

The design extends the existing architecture while maintaining backward compatibility and adding support for multiple inference backends (vLLM, llama.cpp, Ollama).

---

## System Architecture

### High-Level Component Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                        VSCode Extension Host                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐              ┌──────────────────┐        │
│  │  Autocomplete    │              │  Rewrite Action  │        │
│  │  Provider        │              │  Provider        │        │
│  │ (existing, +)    │              │  (new)           │        │
│  └────────┬─────────┘              └────────┬─────────┘        │
│           │                                 │                  │
│           └─────────────┬───────────────────┘                  │
│                         │                                      │
│           ┌─────────────▼──────────────────┐                  │
│           │   LlamaCoderService (new)      │                  │
│           │   - Unified prompting          │                  │
│           │   - Context management         │                  │
│           │   - Session state              │                  │
│           └─────────────┬──────────────────┘                  │
│                         │                                      │
│           ┌─────────────▼──────────────────┐                  │
│           │   Backend Abstraction (new)    │                  │
│           │   - Model format adaptation    │                  │
│           │   - Streaming interface        │                  │
│           │   - Error handling             │                  │
│           └─────────────┬──────────────────┘                  │
│                         │                                      │
│        ┌────────────────┼────────────────┐                    │
│        │                │                │                    │
│  ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐              │
│  │  Ollama   │   │   vLLM    │   │ llama.cpp │              │
│  │  Backend  │   │  Backend  │   │  Backend  │              │
│  └───────────┘   └───────────┘   └───────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/gRPC
                            ▼
         ┌──────────────────────────────────┐
         │  Local Inference Server          │
         │  (vLLM / llama.cpp / Ollama)     │
         │                                   │
         │  Models: Qwen, DeepSeek, Llama,  │
         │          Mistral, etc.            │
         └──────────────────────────────────┘
```

### Core Capabilities

#### 1. Inline Completion

**Current Behavior:**
- Insert-only mode using zero-width range at cursor
- Simple prefix/suffix extraction
- Character-based context limits
- Basic caching with exact matching

**Enhanced Behavior:**
- Optional smart replacement mode (replaces conflicting text)
- Token-aware context management with intelligent truncation
- Scope detection (function/class/file boundaries)
- Semantic caching with similarity matching
- Session management for KV cache reuse
- Confidence scoring and fallback strategies

#### 2. Structural Rewrite

**New Capability:**
- User selects code and triggers rewrite action
- Provides instruction (predefined or custom)
- System generates rewrite with broader context
- Visual diff preview shows additions/deletions/modifications
- User accepts or rejects changes atomically
- Supports undo/redo properly

---

## Detailed Component Specifications

### 1. Context Acquisition and Management

#### ContextBuilder Component

**Location:** `src/context/ContextBuilder.ts`

**Responsibilities:**
- Extract prefix/suffix from document at cursor position
- Detect language and load appropriate parser (tree-sitter)
- Determine scope boundaries (function/class/file)
- Extract import statements for additional context
- Add surrounding context for rewrite operations
- Truncate intelligently using actual tokenizer (not character count)
- Calculate final token budget and validate within limits

**Token Budget Allocation:**

For **Completion Mode** (default 4096 tokens):
- Imports: 10% (410 tokens)
- Prefix: 70% (2867 tokens)
- Suffix: 20% (819 tokens)

For **Rewrite Mode** (default 8192 tokens):
- Imports: 15% (1229 tokens)
- Surrounding context: 20% (1638 tokens)
- Selected text: 50% (4096 tokens)
- After selection: 15% (1229 tokens)

**Key Features:**
- AST-based scope detection using tree-sitter
- Fallback heuristics when parser unavailable
- Token-aware truncation with line boundary adjustment
- Support for notebook cells (existing functionality preserved)
- Language-specific comment syntax for headers

#### SemanticCache Component

**Location:** `src/context/SemanticCache.ts`

**Improvements over existing cache:**
- LRU eviction policy (max 1000 entries, 50MB size limit)
- Multiple key strategies:
  - Exact match (whitespace-sensitive)
  - Normalized match (whitespace/comments removed)
  - Semantic match (embeddings-based, optional)
- Similarity threshold for fuzzy matching (Jaccard > 0.85)
- Size-aware eviction based on completion length

#### SessionManager Component

**Location:** `src/context/SessionManager.ts`

**Purpose:** Maintain short-lived sessions with backend for KV cache reuse

**Features:**
- Per-document sessions with 5-minute TTL
- Automatic cleanup of expired sessions
- Backend support detection (vLLM, llama.cpp support KV cache)
- Delta-only updates for repeated interactions

### 2. Backend Communication Architecture

#### IInferenceBackend Interface

**Location:** `src/backends/IInferenceBackend.ts`

**Core Interface:**
```typescript
interface IInferenceBackend {
    checkModel(modelName: string): Promise<boolean>;
    downloadModel?(modelName: string, onProgress?: (progress: number) => void): Promise<void>;
    streamCompletion(request: CompletionRequest): AsyncGenerator<string>;
    streamRewrite(request: RewriteRequest): AsyncGenerator<string>;
    getCapabilities(): BackendCapabilities;
    dispose(): void;
}
```

**Supported Backends:**

| Backend | Check Model | Download | Generate | KV Cache | Context Window |
|---------|-------------|----------|----------|----------|----------------|
| Ollama | GET /api/tags | POST /api/pull | POST /api/generate | No | Model-dependent |
| vLLM | GET /v1/models | N/A | POST /v1/completions | Yes (auto) | Query from API |
| llama.cpp | GET /health | N/A | POST /completion | Yes (explicit) | Query /props |

**Backend-Specific Implementations:**

1. **OllamaBackend** (`src/backends/OllamaBackend.ts`)
   - Refactored from existing code
   - Supports FIM and instruction-following
   - Model download with progress streaming
   - Bearer token authentication

2. **VLLMBackend** (`src/backends/VLLMBackend.ts`)
   - OpenAI-compatible API
   - SSE streaming format
   - Automatic prefix caching
   - Optional API key authentication

3. **LlamaCppBackend** (`src/backends/LlamaCppBackend.ts`)
   - Custom JSON streaming format
   - Explicit KV cache control
   - Single model loaded at startup
   - No authentication typically needed

#### Retry and Error Handling

**RetryPolicy Component** (`src/backends/RetryPolicy.ts`):
- Exponential backoff with jitter
- Max 3 retries by default
- Non-retryable errors: 400, 401, 404
- Configurable base delay (1s) and max delay (10s)
- Cancellation support via AbortSignal

**Error Categories:**
- Network errors: Connection refused, timeout
- Model errors: Model not found, not loaded
- Parse errors: Malformed response JSON
- Unknown errors: Logged and reported gracefully

### 3. Edit Application and UI Behavior

#### DiffPreviewManager Component

**Location:** `src/ui/DiffPreviewManager.ts`

**Responsibilities:**
- Compute line-by-line diff using Myers algorithm
- Apply decorations for additions (green), deletions (red), modifications (yellow)
- Show inline CodeLens with accept/reject buttons
- Display summary: "N lines changed, M added, K removed"
- Handle user decision and cleanup decorations

**Decoration Types:**
```typescript
// Uses VSCode theme colors for consistency
'addition': diffEditor.insertedTextBackground
'deletion': diffEditor.removedTextBackground
'modification': diffEditor.changedTextBackground
```

**User Interaction Flow:**
1. Diff preview appears with decorations
2. CodeLens shows "✓ Accept (summary)" and "✗ Reject"
3. User clicks button or dismisses
4. On accept: Apply WorkspaceEdit, add to undo stack
5. On reject: Clear decorations, restore original view
6. All operations atomic and undoable

#### RewriteActionProvider Component

**Location:** `src/prompts/RewriteActionProvider.ts`

**VSCode Integration:**
- Implements `CodeActionProvider` interface
- Registers with `CodeActionKind.RefactorRewrite`
- Only shows actions when text is selected
- Provides quick actions menu

**Available Actions:**
- "Rewrite with AI..." - custom instruction input
- "Simplify" - reduce complexity
- "Add error handling" - comprehensive error checks
- "Add type annotations" - explicit types
- "Optimize performance" - performance improvements
- "Make more readable" - readability enhancements

### 4. Prompting Strategy and Model Neutrality

#### PromptBuilder Component

**Location:** `src/prompts/PromptBuilder.ts`

**Completion Prompts:**
- Uses existing FIM format adaptation from `models.ts`
- Supports DeepSeek and Qwen formats
- Extensible for new model families
- Injects file headers and imports

**Rewrite Prompts:**
- Model-specific instruction templates:
  - Qwen: `<|im_start|>system...user...assistant` format
  - DeepSeek: `### System...User...Assistant` format
  - Llama: `<|begin_of_text|><|start_header_id|>` format
  - Mistral: `<s>[INST]...[/INST]` format
  - Default: Plain text with markdown code blocks
- Supports JSON and tagged XML output formats
- Includes context, selected text, and instruction

#### ResponseParser Component

**Location:** `src/prompts/ResponseParser.ts`

**Parsing Strategy:**
1. Try JSON format first (with markdown code block extraction)
2. Fall back to tagged XML format (`<REWRITTEN>...</REWRITTEN>`)
3. Ultimate fallback: treat entire response as rewritten code

**Validation:**
- Check for non-empty content
- Filter prompt artifacts (FIM tokens, chat tokens)
- Optional syntax validation via tree-sitter
- Confidence scoring based on parse success

**Output Structure:**
```typescript
interface RewriteResult {
    rewritten: string;
    changes: string[];  // Human-readable change descriptions
}
```

### 5. Configuration Model

#### Configuration Hierarchy

```text
inference.*          - Backend connection settings
  ├── backend        - Type: ollama, vllm, llamacpp
  ├── endpoint       - Server URL
  ├── bearerToken    - Auth token (Ollama)
  ├── apiKey         - API key (vLLM)
  ├── model          - Selected model
  ├── timeout        - Request timeout (30s default)
  └── retryAttempts  - Retry count (3 default)

completion.*         - Inline completion settings
  ├── enableReplacements    - Smart replacement mode
  ├── minConfidence         - Confidence threshold (0.5)
  ├── contextWindow         - Max context tokens (4096)
  └── enableSemanticCache   - Semantic caching

rewrite.*           - Structural rewrite settings
  ├── contextWindow         - Max context tokens (8192)
  ├── temperature           - Sampling temp (0.7)
  ├── showDiffPreview       - Show preview before apply
  └── autoAcceptThreshold   - Auto-accept confidence (0.95, 0=never)

advanced.*          - Advanced features
  ├── scopeDetection        - Scope level: none/function/class/file
  ├── enableParserIntegration - Use tree-sitter parsers
  ├── enableSessionCache    - KV cache session reuse
  └── logLevel              - error/warn/info/debug

telemetry.*         - Usage analytics (local only)
  └── enabled               - Track usage stats
```

#### Configuration Access Pattern

```typescript
// Centralized config access via singleton
import { config } from './config';

const inferenceConfig = config.inference;
const completionConfig = config.completion;
const rewriteConfig = config.rewrite;
```

### 6. Forward Evolution and Reliability

#### Error Handling Strategy

**ErrorHandler Component** (`src/errors/ErrorHandler.ts`):
- Categorize errors: network, model, parse, unknown
- Log to output channel with structured data
- Show user-friendly messages
- Track in telemetry for debugging
- Provide recovery options (retry, cancel, fallback)

**Graceful Degradation:**
- Network error → Inform user, don't crash
- Model error → Try fallback model if configured
- Parse error → Log but don't show to user
- Unknown error → Log and show generic message

#### Fallback Strategy

**FallbackStrategy Component** (`src/prompts/FallbackStrategy.ts`):

Progressive degradation approach:
1. Full context, FIM mode
2. Reduced context (50%), FIM mode
3. Minimal context (20%), prefix-only mode
4. Give up gracefully

**Benefits:**
- Handles context window overflow
- Adapts to backend limitations
- Maintains functionality under constraints
- Logs fallback usage for optimization

#### Telemetry Service

**TelemetryService Component** (`src/telemetry/TelemetryService.ts`):

**Local-only, opt-in telemetry:**
- Track completion acceptance rate
- Measure latency percentiles (p50, p99)
- Count errors by operation type
- Store in VSCode globalState (max 10K events)
- Provide statistics view for users
- No external transmission

**Tracked Metrics:**
```typescript
interface TelemetryStatistics {
    completions: {
        total: number;
        accepted: number;
        averageLatency: number;
    };
    rewrites: {
        total: number;
        accepted: number;
        averageLatency: number;
    };
    errors: {
        total: number;
        byOperation: Record<string, number>;
    };
}
```

---

## Key Technical Decisions

### Context Management
- **Decision:** Use actual tokenizer for context truncation
- **Rationale:** Character counts are inaccurate; tokens are the true limit
- **Trade-off:** Slight CPU overhead for tokenization vs. accurate budget management

### Backend Abstraction
- **Decision:** Interface-based abstraction with async generators
- **Rationale:** Clean separation, easy to extend, streaming-native
- **Trade-off:** More code upfront vs. easier long-term maintenance

### Caching Strategy
- **Decision:** LRU cache with multiple key strategies
- **Rationale:** Balance memory usage with hit rate optimization
- **Trade-off:** Memory overhead (50MB) vs. reduced API calls

### Diff Preview
- **Decision:** Use VSCode decorations + CodeLens (not custom UI)
- **Rationale:** Native look-and-feel, no webview complexity
- **Trade-off:** Limited customization vs. better integration

### Prompting
- **Decision:** Model-specific templates with fallback
- **Rationale:** Best quality per model vs. single generic template
- **Trade-off:** More templates to maintain vs. better results

### Error Handling
- **Decision:** Multi-layer error boundaries with fallbacks
- **Rationale:** Never crash the extension, always provide feedback
- **Trade-off:** More code complexity vs. robustness

### Session Management
- **Decision:** Optional KV cache reuse with 5-minute TTL
- **Rationale:** Performance boost for supported backends
- **Trade-off:** State management complexity vs. latency reduction

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Inline Completion Latency | < 500ms p50, < 2s p99 | From trigger to first token |
| Rewrite Latency | < 3s p50, < 10s p99 | From request to complete response |
| Cache Hit Rate | > 30% | For repeated editing patterns |
| Memory Usage | < 100MB | Extension process RSS |
| Context Building | < 50ms | From document to prompt |
| Token Processing | > 20 tokens/sec | Streaming throughput |

## Compatibility Requirements

### VSCode Version
- Minimum: 1.80.0 (for latest InlineCompletion API)
- Recommended: 1.85.0+ (for improved CodeAction support)

### Model Requirements
- Must support Fill-In-Middle (FIM) for completion
- Base models preferred over instruct for completion
- Instruct models required for rewrite
- Context window: 4K minimum, 8K+ recommended

### Backend Requirements
- HTTP/HTTPS endpoint
- Streaming support required
- Authentication: Bearer token or API key
- Response format: JSON or newline-delimited JSON

### Language Support
- All 27 currently supported languages
- Extensible via `languages.ts` definition file
- Tree-sitter parsers optional but recommended

---

## Success Criteria

### Functional Requirements
- ✓ Inline completion works with all three backends
- ✓ Smart replacement mode replaces conflicting text
- ✓ Rewrite action appears in lightbulb menu
- ✓ Diff preview shows before applying changes
- ✓ All operations cancellable by user
- ✓ Backward compatible with existing configuration

### Performance Requirements
- ✓ Meets latency targets (see table above)
- ✓ Cache hit rate above 30%
- ✓ Memory usage under 100MB
- ✓ No UI freezes or blocking operations

### Reliability Requirements
- ✓ Graceful handling of network failures
- ✓ Malformed model output doesn't crash
- ✓ All errors logged with context
- ✓ Fallback strategies prevent total failure

### Usability Requirements
- ✓ Configuration discoverable and well-documented
- ✓ Error messages actionable
- ✓ UI consistent with VSCode patterns
- ✓ Keyboard shortcuts for common actions

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Existing system architecture
- [AI_AUTOCOMPLETE_IMPLEMENTATION_ROADMAP.md](./AI_AUTOCOMPLETE_IMPLEMENTATION_ROADMAP.md) - Implementation plan
- [package.json](../package.json) - Extension configuration

---

## Document Version

- **Version:** 1.0
- **Date:** 2025-01-21
- **Status:** Design approved, awaiting implementation
