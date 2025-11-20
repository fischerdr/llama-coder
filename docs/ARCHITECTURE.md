# Architecture & Logic Flow

This document provides a detailed explanation of how Llama Coder works internally and how to extend it with new inference backends.
What's Included
Complete Flow Diagram: A detailed ASCII diagram showing the entire request flow from user typing to completion display, including all 12 steps with decision points. Detailed Component Analysis: Deep dive into each major component:
Extension activation
Configuration system (including a bug I found: typo on line 30)
Prompt provider with all pipeline stages
Prompt preparation with notebook handling
Autocomplete engine phases
Language detection strategy
Model format adaptation with comparison table
Streaming & Completion Logic: Explains the sophisticated block stack algorithm that prevents incomplete code blocks, with examples showing why it matters. Extension Points: Clear guidance on where to hook in new features for the five most common enhancement areas. Adding New Inference Backends: This is the most detailed section, providing:
Full backend abstraction design with TypeScript interfaces
Complete implementations for 4 backends:
Ollama (refactored from existing)
OpenAI-compatible APIs
vLLM (with specific optimizations)
llama.cpp (different API format)
Two implementation approaches:
Option 1: Full abstraction (better long-term)
Option 2: Minimal changes (faster to implement)
Configuration changes needed in package.json
Testing guide with example commands
Comparison table showing API differences across backends
Migration path with time estimates (~1 week)

## Table of Contents

1. [Complete Flow Diagram](#complete-flow-diagram)
2. [Detailed Component Analysis](#detailed-component-analysis)
3. [Streaming & Completion Logic](#streaming--completion-logic)
4. [Extension Points](#extension-points)
5. [Adding New Inference Backends](#adding-new-inference-backends)

## Complete Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER TYPES IN EDITOR                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. VSCODE INLINE COMPLETION TRIGGER                            │
│    - After delay (default 250ms, configurable)                 │
│    - Calls: provider.provideInlineCompletionItems()            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. FILTERS & VALIDATION                                        │
│    - Check if paused                                           │
│    - isSupported(): file/notebook/remote schemes only          │
│    - isNotNeeded(): (currently minimal filtering)              │
│    - Check cancellation token                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. ACQUIRE ASYNC LOCK                                          │
│    - Ensures only ONE completion request at a time             │
│    - Queues subsequent requests                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. PROMPT PREPARATION (preparePrompt)                          │
│                                                                 │
│  a) Extract prefix/suffix from document at cursor position     │
│  b) If Jupyter notebook:                                       │
│      - Aggregate all cells before/after current cell           │
│      - Include markdown cells as comments (if configured)      │
│      - Include cell outputs as comments (if configured)        │
│  c) Detect language from file path/extension                   │
│  d) Inject file header with filename and language info         │
│                                                                 │
│  Output: { prefix: string, suffix: string }                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. CHECK PROMPT CACHE                                          │
│    - Key: hash(prefix + suffix)                                │
│    - If HIT: return cached completion immediately              │
│    - If MISS: proceed to inference                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ (cache miss)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. MODEL AVAILABILITY CHECK                                    │
│    - GET {endpoint}/api/tags                                   │
│    - Search for configured model in list                       │
│    - If not found: prompt user to download                     │
│    - Check globalState for download-ignored flag               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. MODEL DOWNLOAD (if needed)                                  │
│    - POST {endpoint}/api/pull with model name                  │
│    - Stream download progress                                  │
│    - Update status bar: "Downloading"                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. AUTOCOMPLETE EXECUTION                                      │
│                                                                 │
│  a) Format prompt using model-specific FIM template:           │
│     - DeepSeek: <｜fim▁begin｜>...<｜fim▁hole｜>...<｜fim▁end｜>│
│     - Qwen: <|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>  │
│                                                                 │
│  b) Build request payload:                                     │
│     {                                                           │
│       model: "qwen2.5-coder:7b",                               │
│       prompt: "<formatted FIM prompt>",                        │
│       raw: true,                                               │
│       options: {                                               │
│         stop: ["<|endoftext|>", ...],                          │
│         num_predict: 100,                                      │
│         temperature: 0.2                                       │
│       }                                                         │
│     }                                                           │
│                                                                 │
│  c) POST {endpoint}/api/generate                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. STREAMING TOKEN PROCESSING                                 │
│                                                                 │
│  For each line in HTTP response stream:                        │
│    - Parse JSON: { model, response, done }                     │
│    - Track bracket/paren/brace stack:                          │
│        • Push on '[', '(', '{'                                 │
│        • Pop on ']', ')', '}'                                  │
│        • Break on mismatch (prevents incomplete blocks)        │
│    - Accumulate response characters                            │
│    - Count newlines                                            │
│    - If lines > maxLines AND stack.length === 0:              │
│        • Stop (we're at top-level scope)                       │
│    - Check cancellation token continuously                     │
│                                                                 │
│  Post-processing:                                              │
│    - Strip trailing <EOT> token if present                     │
│    - Trim trailing whitespace from each line                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 11. CACHE & RETURN                                             │
│     - Store result in prompt cache                             │
│     - Return InlineCompletionItem to VSCode                    │
│     - Release async lock                                       │
│     - Update status bar: "Llama Coder" (ready)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 12. VSCODE DISPLAYS GHOST TEXT                                 │
│     - User can accept with Tab/Enter                           │
│     - User can ignore and continue typing                      │
└─────────────────────────────────────────────────────────────────┘
```

## Detailed Component Analysis

### Extension Activation (`extension.ts`)

**Responsibilities:**

- Initialize logging output channel
- Create status bar item with toggle command
- Register `InlineCompletionItemProvider` for all file patterns (`**`)
- Register pause/resume/toggle commands

**Key Points:**

- Extension activates on `onStartupFinished` (see `package.json`)
- Provider registered globally for all document types
- Status bar shows current state and provides quick toggle

### Configuration System (`config.ts`)

**Design Pattern:** Singleton with computed properties

**Why This Matters:**

- Configuration is read fresh on every access (no stale state)
- Endpoint normalization (strips trailing slashes, defaults to localhost)
- Model format is auto-detected from model name prefix
- Typo in code: `cutom.format` instead of `custom.format` (line 30)

**Key Configuration Flow:**

```typescript
config.inference → {
  endpoint: string,      // Normalized URL
  bearerToken: string,   // For auth
  modelName: string,     // Full model identifier
  modelFormat: ModelFormat, // Auto-detected or from custom.format
  maxLines: number,      // When to stop generating
  maxTokens: number,     // Max tokens from model
  temperature: number,   // Sampling temperature
  delay: number         // Trigger delay (-1 = disabled)
}
```

### Prompt Provider (`prompts/provider.ts`)

**Core State:**

- `lock: AsyncLock` - Prevents concurrent completions
- `paused: boolean` - User-controlled pause state
- `statusbar: StatusBarItem` - UI feedback
- Uses `ExtensionContext.globalState` for persistent download preferences

**Request Pipeline Stages:**

1. **Pre-flight checks** (lines 68-93)
   - Delay completion if configured
   - Check paused state
   - Validate document scheme
   - Check if completion needed
   - Early cancellation check

2. **Lock acquisition** (line 96)
   - Only one completion at a time
   - Subsequent requests queue

3. **Prompt preparation** (line 99)
   - See detailed section below

4. **Cache lookup** (lines 109-112)
   - Fast path for repeated requests

5. **Model management** (lines 125-152)
   - Check model exists
   - Prompt for download if missing
   - Remember if user declined
   - Stream download with progress

6. **Inference** (lines 160-172)
   - Call autocomplete with all parameters
   - Pass cancellation callback

7. **Cache storage** (lines 175-179)
   - Store for future requests

### Prompt Preparation (`prompts/preparePrompt.ts`)

**Input:** VSCode document, cursor position, completion context
**Output:** `{ prefix: string, suffix: string }`

**Process:**

1. **Basic extraction:**

   ```typescript
   text = document.getText()
   prefix = text.slice(0, cursorOffset)
   suffix = text.slice(cursorOffset)
   ```

2. **Notebook handling** (if applicable):
   - Find notebook document by URI path
   - Iterate all cells
   - For cells BEFORE current:
     - Add markdown as comments (if `includeMarkup`)
     - Add code as-is
     - Add cell outputs as comments (if `includeCellOutputs`)
   - For cells AFTER current:
     - Add to suffix
   - Reconstruct: `prefix = prefixCells + prefix`

3. **Language detection:**
   - Uses file path and VSCode languageId
   - Matches against known languages in `languages.ts`

4. **Header injection:**
   - Adds comment at top with filename and language
   - Example: `# Path: src/extension.ts` (Python comment style)
   - Helps model understand context

**Why Notebooks Are Special:**

- Cells are separate documents in VSCode
- Need to aggregate context across cell boundaries
- Outputs provide valuable context (e.g., error messages, data)
- Markdown cells often explain intent

### Autocomplete Engine (`prompts/autocomplete.ts`)

**The Heart of Code Generation**

**Phase 1: Prompt Formatting**

```typescript
// Before: { prefix, suffix, format }
adaptPrompt({ prefix, suffix, format: 'qwen' })
// After: {
//   prompt: "<|fim_prefix|>prefix<|fim_suffix|>suffix<|fim_middle|>",
//   stop: ["<|endoftext|>", "<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>"]
// }
```

**Phase 2: Request Construction**

```typescript
{
  model: "qwen2.5-coder:7b",
  prompt: "<formatted>",
  raw: true,                    // Don't use chat template
  options: {
    stop: [...],                // Model-specific stop tokens
    num_predict: maxTokens,     // Limit generation
    temperature: 0.2            // Low = more deterministic
  }
}
```

**Phase 3: Streaming & Processing**

The most complex part. See [Streaming & Completion Logic](#streaming--completion-logic) below.

### Language Detection (`prompts/processors/detectLanguage.ts`)

**Strategy:**

1. Try VSCode's `languageId` first (most reliable)
2. Fall back to file extension mapping
3. Handle special cases (e.g., `.mjs` → `javascript`)

**Language Database** (`languages.ts`):

```typescript
{
  [language: string]: {
    name: string,           // Display name
    extensions: string[],   // File extensions
    comment?: {
      start: string,        // Comment prefix (e.g., "//" or "#")
    }
  }
}
```

**Why This Matters:**

- Determines comment syntax for headers
- Some models trained with language hints
- Affects FIM prompt construction

### Model Format Adaptation (`prompts/processors/models.ts`)

**Two FIM Formats:**

| Format | Template | Stop Tokens |
|--------|----------|-------------|
| DeepSeek | `<｜fim▁begin｜>{prefix}<｜fim▁hole｜>{suffix}<｜fim▁end｜>` | `<｜fim▁begin｜>`, `<｜fim▁hole｜>`, `<｜fim▁end｜>` |
| Qwen | `<\|fim_prefix\|>{prefix}<\|fim_suffix\|>{suffix}<\|fim_middle\|>` | `<\|endoftext\|>`, `<\|fim_prefix\|>`, `<\|fim_suffix\|>`, `<\|fim_middle\|>` |

**Critical Insight:** The model MUST be trained with the correct FIM format. Using the wrong template will produce garbage output.

### Ollama Integration Layer

**Three-Step API Usage:**

1. **Check Model** (`ollamaCheckModel.ts`):

   ```typescript
   GET {endpoint}/api/tags
   → { models: [{ name: "qwen2.5-coder:7b" }, ...] }
   ```

2. **Download Model** (`ollamaDownloadModel.ts`):

   ```typescript
   POST {endpoint}/api/pull
   Body: { name: "qwen2.5-coder:7b" }
   → Streaming JSON with status/progress
   ```

3. **Generate** (`ollamaTokenGenerator.ts`):

   ```typescript
   POST {endpoint}/api/generate
   Body: { model, prompt, options }
   → Streaming newline-delimited JSON
   ```

**Line Generator** (`modules/lineGenerator.ts`):

- Low-level HTTP streaming primitive
- Yields complete lines from chunked response
- Handles partial chunks at boundaries
- Aborts stream on cancellation

## Streaming & Completion Logic

### The Block Stack Algorithm

**Problem:** Model might generate incomplete code blocks.

**Solution:** Track bracket nesting depth.

```typescript
let blockStack: ('[' | '(' | '{')[] = [];

for each character c in stream:
  if c === '[' || c === '(' || c === '{':
    blockStack.push(c)

  if c === ']':
    if blockStack.top === '[':
      blockStack.pop()
    else:
      BREAK  // Mismatched bracket, stop generation

  // Similar for ')' and '}'

  append c to result

  if line_count > maxLines AND blockStack.length === 0:
    BREAK  // At top-level, safe to stop
```

**Example:**

```python
def calculate(x):
    if x > 0:        # Stack: []
        return {     # Stack: ['{']
            'value': x,
            'valid': True
        }            # Stack: []  ← Safe to stop here
                     # NOT safe to stop inside the dict!
```

### Line Limit Logic

```typescript
totalLines = 1  // Start at 1 (current line)

for each token:
  totalLines += count_newlines(token)

  if totalLines > maxLines AND blockStack.length === 0:
    break  // Only stop when at top-level scope
```

**Why This Matters:**

- Prevents runaway generation
- Ensures syntactically valid completions
- Balances completion length vs. generation time

### Post-Processing

1. **Strip End Tokens:**

   ```typescript
   if result.endsWith('<EOT>'):
     result = result.slice(0, -5)
   ```

2. **Trim Line Endings:**

   ```typescript
   result = result.split('\n')
     .map(line => line.trimEnd())
     .join('\n')
   ```

   **Rationale:** Models sometimes add trailing spaces; VSCode shows these as visible characters.

## Extension Points

### Where to Hook In New Features

1. **Add New Filters** → `prompts/filter.ts`
   - Example: Skip completion in comments
   - Example: Require minimum line length

2. **Enhance Context** → `prompts/preparePrompt.ts`
   - Example: Include import statements
   - Example: Add function signatures from open files

3. **Custom Prompt Templates** → `prompts/processors/models.ts`
   - Example: Add Qwen or StarCoder formats

4. **Post-Processing** → `prompts/autocomplete.ts`
   - Example: Format code with Prettier
   - Example: Filter out duplicate lines

5. **Cache Strategy** → `prompts/promptCache.ts`
   - Currently simple in-memory Map
   - Could add LRU eviction, disk persistence

## Adding New Inference Backends

### Architecture Requirements

The current architecture is **Ollama-specific** but can be generalized. Here's how to add support for other backends:

### Option 1: OpenAI-Compatible APIs

**Many services are compatible:** vLLM, llama.cpp server, Text Generation Inference, LocalAI, etc.

**Implementation Path:**

1. **Add Backend Enum** in `config.ts`:

   ```typescript
   type InferenceBackend = 'ollama' | 'openai' | 'vllm' | 'llamacpp';

   get inference() {
     // ...
     let backend = config.get('backend') as InferenceBackend;
     return { ...existing, backend };
   }
   ```

2. **Create Backend Abstraction Layer:**

   Create `src/backends/base.ts`:

   ```typescript
   export interface InferenceBackend {
     checkModel(model: string): Promise<boolean>;
     downloadModel?(model: string): Promise<void>;
     generateCompletion(params: {
       model: string,
       prefix: string,
       suffix: string,
       format: ModelFormat,
       maxTokens: number,
       temperature: number,
       stop: string[],
       canceled: () => boolean
     }): AsyncGenerator<string>;
   }
   ```

3. **Implement Ollama Backend** in `src/backends/ollama.ts`:

   ```typescript
   export class OllamaBackend implements InferenceBackend {
     constructor(private endpoint: string, private bearerToken: string) {}

     async checkModel(model: string): Promise<boolean> {
       // Move logic from ollamaCheckModel.ts
     }

     async downloadModel(model: string): Promise<void> {
       // Move logic from ollamaDownloadModel.ts
     }

     async *generateCompletion(params): AsyncGenerator<string> {
       // Move logic from autocomplete.ts
       // Yield tokens as they arrive
     }
   }
   ```

4. **Implement OpenAI Backend** in `src/backends/openai.ts`:

   ```typescript
   export class OpenAIBackend implements InferenceBackend {
     constructor(
       private endpoint: string,  // e.g., https://api.openai.com/v1
       private apiKey: string
     ) {}

     async checkModel(model: string): Promise<boolean> {
       // GET /v1/models
       // Check if model in list
     }

     async *generateCompletion(params): AsyncGenerator<string> {
       // POST /v1/completions
       const response = await fetch(`${this.endpoint}/completions`, {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${this.apiKey}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
           model: params.model,
           prompt: adaptPrompt({
             prefix: params.prefix,
             suffix: params.suffix,
             format: params.format
           }).prompt,
           max_tokens: params.maxTokens,
           temperature: params.temperature,
           stop: params.stop,
           stream: true
         })
       });

       // Stream response
       const reader = response.body.getReader();
       const decoder = new TextDecoder();

       while (true) {
         const { done, value } = await reader.read();
         if (done) break;
         if (params.canceled()) break;

         const chunk = decoder.decode(value);
         // Parse SSE format: "data: {...}\n\n"
         const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

         for (const line of lines) {
           const data = JSON.parse(line.slice(6));
           if (data.choices?.[0]?.text) {
             yield data.choices[0].text;
           }
         }
       }
     }
   }
   ```

5. **Implement vLLM Backend** in `src/backends/vllm.ts`:

   ```typescript
   export class VLLMBackend implements InferenceBackend {
     // vLLM uses OpenAI-compatible API
     // Can extend OpenAIBackend or duplicate logic

     async *generateCompletion(params): AsyncGenerator<string> {
       // POST /v1/completions (OpenAI-compatible)
       // OR use vLLM-specific /generate endpoint

       // vLLM supports FIM natively with special tokens
       const response = await fetch(`${this.endpoint}/v1/completions`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           model: params.model,
           prompt: adaptPrompt({
             prefix: params.prefix,
             suffix: params.suffix,
             format: params.format
           }).prompt,
           max_tokens: params.maxTokens,
           temperature: params.temperature,
           stop: params.stop,
           stream: true,
           // vLLM-specific: can pass raw FIM tokens
           use_beam_search: false,
         })
       });

       // Same streaming logic as OpenAI
     }
   }
   ```

6. **Implement llama.cpp Backend** in `src/backends/llamacpp.ts`:

   ```typescript
   export class LlamaCppBackend implements InferenceBackend {
     // llama.cpp server uses different API

     async checkModel(model: string): Promise<boolean> {
       // llama.cpp loads one model at startup
       // GET /props returns model info
       try {
         const res = await fetch(`${this.endpoint}/props`);
         return res.ok;  // If server responds, model is loaded
       } catch {
         return false;
       }
     }

     async *generateCompletion(params): AsyncGenerator<string> {
       // POST /completion
       const response = await fetch(`${this.endpoint}/completion`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           prompt: adaptPrompt({
             prefix: params.prefix,
             suffix: params.suffix,
             format: params.format
           }).prompt,
           n_predict: params.maxTokens,
           temperature: params.temperature,
           stop: params.stop,
           stream: true,
           cache_prompt: true,  // llama.cpp-specific optimization
         })
       });

       // Stream format: newline-delimited JSON
       for await (const line of lineGenerator(
         `${this.endpoint}/completion`,
         { /* ... */ },
         ''
       )) {
         const data = JSON.parse(line);
         if (data.content) {
           yield data.content;
         }
         if (data.stop) break;
       }
     }
   }
   ```

7. **Update autocomplete.ts to use backend:**

   ```typescript
   import { createBackend } from '../backends/factory';

   export async function autocomplete(args) {
     // Create appropriate backend
     const backend = createBackend({
       type: args.backendType,
       endpoint: args.endpoint,
       bearerToken: args.bearerToken,
     });

     // Use backend
     let res = '';
     let totalLines = 1;
     let blockStack = [];

     for await (const token of backend.generateCompletion({
       model: args.model,
       prefix: args.prefix,
       suffix: args.suffix,
       format: args.format,
       maxTokens: args.maxTokens,
       temperature: args.temperature,
       stop: adaptPrompt({ format: args.format }).stop,
       canceled: args.canceled,
     })) {
       // Same block stack logic
       // ... existing code ...
     }

     return res;
   }
   ```

8. **Backend Factory** in `src/backends/factory.ts`:

   ```typescript
   import { OllamaBackend } from './ollama';
   import { OpenAIBackend } from './openai';
   import { VLLMBackend } from './vllm';
   import { LlamaCppBackend } from './llamacpp';

   export function createBackend(config: {
     type: 'ollama' | 'openai' | 'vllm' | 'llamacpp',
     endpoint: string,
     bearerToken?: string,
     apiKey?: string,
   }): InferenceBackend {
     switch (config.type) {
       case 'ollama':
         return new OllamaBackend(config.endpoint, config.bearerToken || '');
       case 'openai':
         return new OpenAIBackend(config.endpoint, config.apiKey || '');
       case 'vllm':
         return new VLLMBackend(config.endpoint);
       case 'llamacpp':
         return new LlamaCppBackend(config.endpoint);
       default:
         throw new Error(`Unknown backend: ${config.type}`);
     }
   }
   ```

### Option 2: Minimal Changes Approach

If you want to minimize code changes and just support OpenAI-compatible APIs:

1. **Add configuration** in `package.json`:

   ```json
   "inference.apiType": {
     "type": "string",
     "enum": ["ollama", "openai-compatible"],
     "default": "ollama"
   }
   ```

2. **Modify `ollamaTokenGenerator.ts`** to handle different response formats:

   ```typescript
   export async function* tokenGenerator(
     url: string,
     data: any,
     bearerToken: string,
     apiType: 'ollama' | 'openai-compatible'
   ) {
     for await (let line of lineGenerator(url, data, bearerToken)) {
       if (apiType === 'ollama') {
         // Existing logic
         const parsed = JSON.parse(line);
         yield parsed;
       } else {
         // OpenAI SSE format: "data: {...}"
         if (line.startsWith('data: ')) {
           const data = JSON.parse(line.slice(6));
           yield {
             model: data.model,
             response: data.choices?.[0]?.text || '',
             done: data.choices?.[0]?.finish_reason !== null
           };
         }
       }
     }
   }
   ```

### Configuration Additions Needed

Add to `package.json` configuration section:

```json
{
  "inference.backend": {
    "type": "string",
    "enum": ["ollama", "openai", "vllm", "llamacpp"],
    "default": "ollama",
    "description": "Inference backend to use"
  },
  "inference.apiKey": {
    "type": "string",
    "default": "",
    "description": "API key for OpenAI-compatible backends"
  }
}
```

### Testing New Backends

1. **Start local backend:**

   ```bash
   # vLLM example
   python -m vllm.entrypoints.openai.api_server \
     --model Qwen/Qwen2.5-Coder-7B-Instruct \
     --port 8000

   # llama.cpp example
   ./server -m models/qwen2.5-coder-7b.gguf --port 8080
   ```

2. **Configure extension:**
   - Set `inference.backend` to `vllm` or `llamacpp`
   - Set `inference.endpoint` to `http://localhost:8000` or `http://localhost:8080`
   - Set model name accordingly

3. **Test completion** in a code file

### Key Considerations

**Model Compatibility:**

- Not all models support FIM (Fill-In-Middle)
- Base models work better than instruct/chat models for completion
- Check model documentation for FIM token format

**Performance:**

- Local inference: latency depends on hardware
- Remote APIs: network latency matters
- vLLM and llama.cpp have different performance characteristics

**Endpoint Differences:**

| Backend | Check Model | Download Model | Generate |
|---------|-------------|----------------|----------|
| Ollama | `GET /api/tags` | `POST /api/pull` | `POST /api/generate` |
| OpenAI | `GET /v1/models` | N/A (cloud) | `POST /v1/completions` |
| vLLM | `GET /v1/models` | N/A (preloaded) | `POST /v1/completions` |
| llama.cpp | `GET /props` | N/A (preloaded) | `POST /completion` |

**Authentication:**

- Ollama: Optional bearer token
- OpenAI: API key in `Authorization: Bearer <key>`
- vLLM: Usually none (local deployment)
- llama.cpp: Usually none (local deployment)

### Migration Path

1. **Phase 1:** Create backend abstraction (1-2 days)
2. **Phase 2:** Refactor Ollama code to use abstraction (1 day)
3. **Phase 3:** Implement OpenAI backend (1 day)
4. **Phase 4:** Implement vLLM backend (0.5 days - similar to OpenAI)
5. **Phase 5:** Implement llama.cpp backend (1 day)
6. **Phase 6:** Testing and documentation (1-2 days)

**Total Estimate:** ~1 week of development

### Future Enhancements

- **Multiple models:** Support routing to different models by language
- **Fallback chain:** Try multiple backends if one fails
- **A/B testing:** Compare completions from different backends
- **Custom backends:** Plugin system for user-defined backends
- **Caching proxy:** Shared cache across backends
