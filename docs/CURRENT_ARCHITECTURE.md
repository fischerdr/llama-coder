# Current Architecture Overview

Branch: `feat/inline-visual-diff`
Last Updated: 2025-11-29
Status: Implementation Complete, Ready for Testing

## System Overview

llama-coder is a VS Code extension providing AI-powered code completion with local LLM inference. This document describes the current architecture after implementing the inline visual diff feature.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code Extension                        │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Extension.ts                            │  │
│  │  - Registers providers                                     │  │
│  │  - Manages lifecycle                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────┐    ┌────────────────────────────┐   │
│  │   PromptProvider       │    │  RewriteActionProvider     │   │
│  │ (InlineCompletion)     │    │  (CodeAction)              │   │
│  └────────┬───────────────┘    └────────┬───────────────────┘   │
│           │                               │                       │
│           ├──> preparePrompt()           ├──> PromptBuilder     │
│           │                               │                       │
│           ├──> CompletionService ─────────┤                      │
│           │    (Ollama API)               │                       │
│           │                               │                       │
│           ├──> ReplacementAnalyzer       ├──> ResponseParser    │
│           │    ├─> YamlScopeAdapter      │                       │
│           │    ├─> PythonScopeAdapter    └──> DiffPreviewManager│
│           │    └─> BracketScopeAdapter                           │
│           │                                                       │
│           └──> InlineDecorationManager                          │
│                (Visual Diff)                                      │
└───────────────────────────────────────────────────────────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │   Ollama    │
                  │   Server    │
                  └─────────────┘
```

## Core Components

### 1. Extension Entry Point

**File:** `src/extension.ts`

**Responsibilities:**
- Register InlineCompletionItemProvider (PromptProvider)
- Register CodeActionProvider (RewriteActionProvider)
- Register commands (pause, resume, toggle, rewrite, accept, reject)
- Manage status bar
- Handle extension lifecycle

**Key Registrations:**
```typescript
vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    promptProvider
);

vscode.languages.registerCodeActionsProvider(
    { pattern: '**' },
    rewriteActionProvider
);
```

### 2. Prompt Provider (Autocomplete)

**File:** `src/prompts/provider.ts`

**Purpose:** Provides inline code completions with optional visual diff.

**Flow:**
1. Triggered by typing
2. Delay check (configurable, default 250ms)
3. Support/need filters
4. Prepare context (prefix/suffix)
5. Call CompletionService
6. Analyze with ReplacementAnalyzer
7. Decision:
   - If `showVisualDiff`: Apply decorations, return []
   - Else: Return InlineCompletionItem with range

**Key Features:**
- AsyncLock to prevent concurrent requests
- Status bar updates
- Cancellation token support
- Integration with InlineDecorationManager

### 3. Completion Service

**File:** `src/services/CompletionService.ts`

**Purpose:** Unified service layer for AI completions.

**Methods:**
- `complete(prompt, config)` - Get completion from Ollama
- `completeStream(prompt, config)` - Streaming completion (future)

**Configuration:**
```typescript
interface CompletionConfig {
    endpoint: string;
    model: string;
    temperature: number;
    maxTokens: number;
    timeout: number;
}
```

### 4. Replacement Analyzer

**File:** `src/prompts/ReplacementAnalyzer.ts`

**Purpose:** Smart decision tree for code replacement vs insertion.

**Algorithm:**
```
1. Check if replacements enabled
   ↓ No → Insert-only
   ↓ Yes
2. Get language-specific adapter
   ↓
3. Check if cursor is incomplete (mid-statement)
   ↓ Yes → Insert-only
   ↓ No
4. Detect logical unit in completion
   ↓ None → Try single-line partial word replacement
   ↓ Found
5. Find replacement range in existing code
   ↓ Not found → Insert-only
   ↓ Found
6. Calculate confidence score
   ↓
7. Check threshold
   ↓ Below → Insert-only
   ↓ Above
8. Calculate visual diff threshold
   ↓
9. Return ReplacementAnalysis {
      shouldReplace, confidence,
      showVisualDiff, replacedLines,
      replaceRange, insertText
   }
```

**Confidence Scoring:**
```typescript
confidence = unit.baseConfidence;  // 0.8-0.95 depending on unit type

// Adjustments:
if (similarity 30-70%): +0.2  // Partial match suggests refactoring
if (similarity > 90%):  -0.3  // Very similar, might be duplicate
if (indent matches):    +0.1  // Indent levels match

// Cap at 1.0
```

**Visual Diff Threshold:**
```typescript
showVisualDiff =
    replacedLines >= 2 ||     // Multi-line replacement
    confidence > 0.85 ||      // High confidence
    charDiff > 50;            // Large code change
```

### 5. Scope Adapters

**Base Interface:** `src/prompts/scope-adapters/IScopeAdapter.ts`

**Purpose:** Language-specific scope detection for replacements.

**Interface:**
```typescript
interface IScopeAdapter {
    isIncomplete(context: ReplacementContext): boolean;
    detectLogicalUnit(completion: string, context: ReplacementContext): LogicalUnit | null;
    findReplacementRange(context: ReplacementContext, unit: LogicalUnit): vscode.Range | null;
}
```

#### 5.1 YamlScopeAdapter

**File:** `src/prompts/scope-adapters/YamlScopeAdapter.ts`

**Detects:**
- YAML key-value blocks (with indent-based boundaries)
- YAML list items

**Key Logic:**
```typescript
// Detect typing scenario: "  ansible.builtin." + "shell: ..."
const typingKeyMatch = textBeforeCursor.match(/^\s*([a-zA-Z_][\w.-]*)$/);
if (typingKeyMatch) {
    const existingKeyAfter = textAfterCursor.match(/^([a-zA-Z_][\w.-]*)\s*:/);
    if (existingKeyAfter) {
        return false; // This is replacement, NOT incomplete
    }
}
```

**Range Detection:**
- Search backward/forward for matching key at same indent
- Find block end when indent returns to same/lower level
- Return full range from key start to block end

#### 5.2 PythonScopeAdapter

**File:** `src/prompts/scope-adapters/PythonScopeAdapter.ts`

**Detects:**
- Python functions (with decorators)
- Python classes
- Control flow blocks (if/for/while/try/etc)
- Decorators

**Range Detection:**
- Search backward for function/class definition
- Include decorators if present
- Find block end based on indentation

#### 5.3 BracketScopeAdapter

**File:** `src/prompts/scope-adapters/BracketScopeAdapter.ts`

**Purpose:** Conservative fallback for TypeScript/JavaScript.

**Behavior:**
- Only handles incompleteness detection (bracket balance)
- Returns null for logical units (defers to single-line replacement)
- Uses existing ScopeDetector for bracket balance

### 6. Inline Decoration Manager

**File:** `src/ui/InlineDecorationManager.ts`

**Purpose:** Manages visual diff decorations for inline completions.

**Decorations:**
1. **Deletion Decoration** (strikethrough)
   - Red color: `editorError.foreground`
   - Background: `diffEditor.removedTextBackground`
   - Applied to entire replace range (all lines)

2. **Insertion Decoration** (ghost text)
   - Color: `editorGhostText.foreground`
   - Font style: italic
   - Position: END OF FIRST LINE (critical!)
   - Margin: 4px left spacing

**Key Methods:**

```typescript
showVisualDiff(editor, deleteRange, insertText) {
    // Apply strikethrough to ALL lines
    editor.setDecorations(this.deletionDecoration, [deleteRange]);

    // Apply ghost text at END OF FIRST LINE
    const firstLineEnd = editor.document.lineAt(deleteRange.start.line).range.end;
    editor.setDecorations(this.insertionDecoration, [{
        range: new vscode.Range(firstLineEnd, firstLineEnd),
        renderOptions: { after: { contentText: insertText } }
    }]);

    // Store pending edit
    this.currentPendingEdit = { editor, range: deleteRange, newText: insertText };

    // Set context key
    vscode.commands.executeCommand('setContext', 'llama-coder.inlineEditPending', true);

    // Register handlers
    this.registerKeyboardHandlers(editor);
    this.registerDocumentChangeListener(editor);
}

async acceptEdit() {
    const { editor, range, newText } = this.currentPendingEdit;
    await editor.edit(editBuilder => {
        editBuilder.replace(range, newText); // Replace ENTIRE range
    });
    this.clear(editor);
}

rejectEdit(editor) {
    this.clear(editor); // Just clear decorations
}
```

**Lifecycle:**
- Decorations applied when showVisualDiff is true
- Keyboard handlers registered (Tab/Escape)
- Document change listener registered
- Auto-cleanup on:
  - Tab press (accept)
  - Escape press (reject)
  - Document edit inside range
  - New completion request

**Context Key:**
- `llama-coder.inlineEditPending` - Used for keybinding `when` clauses

### 7. Rewrite Feature

**Provider:** `src/prompts/RewriteActionProvider.ts`
**Diff Manager:** `src/ui/DiffPreviewManager.ts`
**Prompt Builder:** `src/prompts/PromptBuilder.ts`
**Response Parser:** `src/prompts/ResponseParser.ts`

**Purpose:** Separate feature for AI-powered code rewrites with diff preview.

**Flow:**
1. User selects code
2. Invokes "Rewrite with AI" code action
3. RewriteActionProvider calls AI with instruction prompt
4. ResponseParser extracts rewritten code
5. DiffPreviewManager shows modal diff
6. User accepts/rejects

**Difference from Inline Completion:**
- Modal dialog vs inline decorations
- Explicit user action vs automatic trigger
- Instruction-based prompts vs FIM prompts
- Full code rewrite vs completion

## Configuration System

**File:** `src/config.ts`

**Namespaces:**

### inference.*
- `endpoint` - Ollama server URL
- `bearerToken` - Auth token
- `model` - Selected model
- `temperature` - Sampling temperature
- `maxLines` - Max completion lines
- `maxTokens` - Max new tokens
- `delay` - Trigger delay (ms)
- `timeout` - Request timeout

### completion.*
- `enableReplacements` - Enable smart replacement mode
- `minConfidence` - Confidence threshold (0-1)

### notebook.*
- `includeMarkup` - Include markdown cells
- `includeCellOutputs` - Include cell outputs
- `cellOutputLimit` - Max output chars

## Data Structures

### ReplacementContext
```typescript
interface ReplacementContext {
    document: vscode.TextDocument;
    position: vscode.Position;
    prefix: string;
    suffix: string;
    completion: string;
    language: Language | null;
    enableReplacements: boolean;
}
```

### ReplacementAnalysis
```typescript
interface ReplacementAnalysis {
    shouldReplace: boolean;
    replaceRange: vscode.Range | null;
    insertText: string;
    confidence: number;
    reason: string;
    logicalUnitType: string | null;
    showVisualDiff: boolean;
    replacedLines: number;
}
```

### LogicalUnit
```typescript
interface LogicalUnit {
    type: string;                    // 'yaml-key-value-block', 'python-function', etc
    identifier: string;              // Key name, function name, etc
    baseConfidence: number;          // 0.8-0.95
    indentLevel?: number;            // Spaces of indentation
    metadata?: Record<string, unknown>;
}
```

## Command Flow Examples

### Example 1: Multi-line YAML Replacement with Visual Diff

**User Action:** Type `ansible.builtin.` when `shell:` exists

```
1. User types → PromptProvider.provideInlineCompletionItems()
   ├─> preparePrompt() → { prefix, suffix }
   ├─> CompletionService.complete()
   │   └─> Ollama API → "ansible.builtin.shell: echo 'test'"
   │
   ├─> ReplacementAnalyzer.analyze()
   │   ├─> YamlScopeAdapter.isIncomplete() → false
   │   ├─> YamlScopeAdapter.detectLogicalUnit() → {
   │   │     type: 'yaml-key-value-block',
   │   │     identifier: 'shell',
   │   │     baseConfidence: 0.9
   │   │   }
   │   ├─> YamlScopeAdapter.findReplacementRange() → Range(L2, L6)
   │   ├─> calculateConfidence() → 0.92
   │   └─> Return {
   │         shouldReplace: true,
   │         replaceRange: Range(L2, L6),
   │         confidence: 0.92,
   │         showVisualDiff: true,  // 5 lines >= 2
   │         replacedLines: 5
   │       }
   │
   ├─> Decision: showVisualDiff is true
   │
   └─> InlineDecorationManager.showVisualDiff()
       ├─> Apply strikethrough to L2-L6
       ├─> Apply ghost text at end of L2
       ├─> Set context key: llama-coder.inlineEditPending = true
       ├─> Register keyboard handlers
       └─> Return [] (no InlineCompletionItem)

2. User presses Tab → acceptInlineEdit command
   └─> InlineDecorationManager.acceptEdit()
       ├─> editor.edit(replace Range(L2, L6) with new text)
       └─> Clear decorations and context key

3. Alternative: User presses Escape → rejectInlineEdit command
   └─> InlineDecorationManager.rejectEdit()
       └─> Clear decorations and context key (no edit)
```

### Example 2: Single-line Replacement (No Visual Diff)

**User Action:** Type partial word completion

```
1. User types → PromptProvider.provideInlineCompletionItems()
   ├─> preparePrompt()
   ├─> CompletionService.complete()
   │
   ├─> ReplacementAnalyzer.analyze()
   │   ├─> detectLogicalUnit() → null (no logical unit)
   │   ├─> singleLineReplacement() → {
   │   │     shouldReplace: true,
   │   │     replaceRange: Range(partial word),
   │   │     confidence: 0.8,
   │   │     showVisualDiff: false,  // Single line
   │   │     replacedLines: 1
   │   │   }
   │
   ├─> Decision: showVisualDiff is false
   │
   └─> Return [{
         insertText: completion,
         range: replaceRange  // Standard InlineCompletionItem
       }]

2. VS Code shows standard ghost text
3. User presses Tab → VS Code applies completion
```

## File Organization

```
src/
├── extension.ts                   # Entry point
├── config.ts                      # Configuration management
│
├── context/                       # Context management (existing)
│   ├── ContextBuilder.ts
│   ├── ScopeDetector.ts
│   └── ...
│
├── modules/                       # Utilities (existing)
│   ├── lock.ts                    # AsyncLock
│   ├── log.ts                     # Logging
│   └── ...
│
├── prompts/                       # Prompt processing
│   ├── provider.ts                # InlineCompletionItemProvider
│   ├── ReplacementAnalyzer.ts     # NEW: Smart replacement
│   ├── PromptBuilder.ts           # NEW: Prompt templates
│   ├── ResponseParser.ts          # NEW: Response parsing
│   ├── RewriteActionProvider.ts   # NEW: Code actions
│   ├── autocomplete.ts            # Existing autocomplete logic
│   ├── preparePrompt.ts           # Existing context preparation
│   ├── filter.ts                  # Existing filters
│   │
│   ├── scope-adapters/            # NEW: Language adapters
│   │   ├── IScopeAdapter.ts
│   │   ├── YamlScopeAdapter.ts
│   │   ├── PythonScopeAdapter.ts
│   │   ├── BracketScopeAdapter.ts
│   │   └── index.ts
│   │
│   └── processors/                # Existing processors
│       ├── models.ts
│       ├── detectLanguage.ts
│       └── ...
│
├── services/                      # NEW: Service layer
│   ├── CompletionService.ts       # Ollama API wrapper
│   └── index.ts
│
└── ui/                            # NEW: UI components
    ├── InlineDecorationManager.ts # Visual diff decorations
    ├── DiffPreviewManager.ts      # Modal diff preview
    └── index.ts
```

## Extension Points

### Adding New Language Support

1. Create new scope adapter implementing `IScopeAdapter`
2. Register in `ReplacementAnalyzer` constructor
3. Implement language-specific logic:
   - `isIncomplete()` - Detect mid-statement cursors
   - `detectLogicalUnit()` - Find logical units in completion
   - `findReplacementRange()` - Find matching code to replace

Example:
```typescript
// src/prompts/scope-adapters/JsonScopeAdapter.ts
export class JsonScopeAdapter implements IScopeAdapter {
    isIncomplete(context: ReplacementContext): boolean {
        // Check for unclosed braces/brackets
    }

    detectLogicalUnit(completion: string, context: ReplacementContext): LogicalUnit | null {
        // Detect JSON object/array
    }

    findReplacementRange(context: ReplacementContext, unit: LogicalUnit): vscode.Range | null {
        // Find matching object/array
    }
}

// Register in ReplacementAnalyzer
const jsonAdapter = new JsonScopeAdapter();
this.adapters.set('json', jsonAdapter);
this.adapters.set('jsonc', jsonAdapter);
```

### Adding Configuration Options

1. Add to `package.json` contributes.configuration
2. Add getter to `src/config.ts`
3. Use in relevant component

Example:
```typescript
// package.json
"completion.showDiffStats": {
    "type": "boolean",
    "default": true,
    "description": "Show diff statistics in visual diff"
}

// src/config.ts
get completion() {
    let config = vscode.workspace.getConfiguration('completion');
    let showDiffStats = config.get('showDiffStats') as boolean;
    return { ..., showDiffStats };
}

// src/ui/InlineDecorationManager.ts
if (config.completion.showDiffStats) {
    // Show "-5 lines, +1 line"
}
```

## Performance Considerations

### Current Targets
- Decoration application: <50ms
- Decoration cleanup: <10ms
- ReplacementAnalyzer analysis: <20ms
- Total overhead: <100ms

### Optimization Strategies
1. **Lazy initialization** - Adapters created once, reused
2. **Early exits** - Decision tree exits early when possible
3. **Minimal DOM updates** - Decorations applied in batches
4. **Efficient cleanup** - Disposables properly managed

### Future Optimizations
1. Cache scope analysis results per document
2. Debounce decoration updates
3. Async decoration application
4. Worker thread for analysis

## Testing Strategy

### Unit Tests (Future)
- ReplacementAnalyzer decision tree
- Confidence scoring algorithm
- Each scope adapter's detection logic
- InlineDecorationManager lifecycle

### Integration Tests (Current)
- Manual testing with real Ansible files
- Performance measurements
- Edge case discovery

### Test Coverage Targets
- ReplacementAnalyzer: >90%
- Scope Adapters: >85%
- InlineDecorationManager: >80%

## Known Limitations

1. **Multi-cursor** - Not yet supported (scoped to single cursor)
2. **Embedded languages** - Limited (e.g., Python in Jinja)
3. **Complex nesting** - May struggle with deep nesting
4. **Partial edits** - Document changes outside range don't trigger cleanup

## Future Enhancements

### Phase 2: Configuration & Customization
- `completion.showVisualDiff` - Toggle feature
- `completion.visualDiffThreshold` - Line threshold
- Color customization
- Diff statistics display

### Phase 3: Additional Languages
- JSON/JSONC adapter
- Markdown adapter
- Shell script adapter
- Go adapter

### Phase 4: Performance
- Cache scope analysis
- Debounce updates
- Async operations
- Worker threads

### Phase 5: UX Improvements
- Preview on hover
- Diff statistics
- Animation/transitions
- Multi-cursor support

## Related Documentation

- [Implementation Details](./INLINE_VISUAL_DIFF_IMPLEMENTATION.md)
- [Testing Guide](../TESTING_VISUAL_DIFF.md)
- [Original Architecture](./ARCHITECTURE.md)
- [Implementation Plan](../home/dfischer/.claude/plans/eager-twirling-lark.md)
