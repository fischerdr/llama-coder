# Inline Visual Diff Implementation

Branch: `feat/inline-visual-diff`
Commit: `06c5a28`
Status: Ready for Testing
Date: 2025-11-29

## Overview

This document describes the implementation of Cursor-style inline visual diff decorations for the llama-coder autocomplete system. The feature shows red strikethrough on code being replaced and green ghost text for new code, all inline BEFORE the user accepts the change.

## Implementation Summary

### What Was Built

1. **InlineDecorationManager** - Core visual diff system
2. **ReplacementAnalyzer** - Smart code replacement decision engine
3. **Scope Adapters** - Language-specific scope detection (YAML, Python, Bracket-based)
4. **CompletionService** - Unified service layer for completions
5. **RewriteActionProvider** - Code action provider for AI rewrites
6. **DiffPreviewManager** - Modal diff preview for rewrite feature

### Key Features

- Red strikethrough decorations on code being replaced
- Green ghost text showing new code at end of first line
- Tab to accept, Escape to reject
- Auto-cleanup on document changes
- Language-aware scope detection
- Confidence-based replacement decisions
- Threshold logic for when to show visual diff

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PromptProvider                            │
│  (InlineCompletionItemProvider)                             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ├──> preparePrompt() - Gather context
                   │
                   ├──> CompletionService.complete() - Get AI completion
                   │
                   ├──> ReplacementAnalyzer.analyze()
                   │    │
                   │    ├──> IScopeAdapter (language-specific)
                   │    │    ├─> YamlScopeAdapter
                   │    │    ├─> PythonScopeAdapter
                   │    │    └─> BracketScopeAdapter
                   │    │
                   │    └──> ReplacementAnalysis {
                   │         shouldReplace, confidence,
                   │         showVisualDiff, replaceRange
                   │         }
                   │
                   └──> Decision:
                        │
                        ├─> If showVisualDiff:
                        │   └─> InlineDecorationManager.showVisualDiff()
                        │       - Apply strikethrough decorations
                        │       - Apply ghost text decorations
                        │       - Register keyboard handlers
                        │       - Return [] (no InlineCompletionItem)
                        │
                        └─> Else:
                            └─> Return InlineCompletionItem with range
```

### Data Flow

1. **User types** triggering autocomplete (e.g., `ansible.builtin.` when `shell:` exists)
2. **PromptProvider** calls ReplacementAnalyzer
3. **ReplacementAnalyzer**:
   - Gets language-specific adapter (YamlScopeAdapter for .yml files)
   - Checks if cursor is incomplete (mid-statement)
   - Detects logical unit in completion (YAML key-value block)
   - Finds replacement range in existing code
   - Calculates confidence score
   - Determines if visual diff should be shown
4. **If showVisualDiff is true**:
   - InlineDecorationManager applies both decorations
   - Keyboard handlers registered (Tab/Escape)
   - Return empty array (decorations handle visualization)
5. **If showVisualDiff is false**:
   - Return standard InlineCompletionItem with replacement range

## File Structure

### New Files

```
src/
├── prompts/
│   ├── PromptBuilder.ts              # Model-specific prompt templates
│   ├── ReplacementAnalyzer.ts        # Smart replacement decision tree
│   ├── ResponseParser.ts             # Response parsing and validation
│   ├── RewriteActionProvider.ts      # Code action provider for rewrites
│   └── scope-adapters/
│       ├── IScopeAdapter.ts          # Interface for scope adapters
│       ├── YamlScopeAdapter.ts       # YAML/Ansible scope detection
│       ├── PythonScopeAdapter.ts     # Python scope detection
│       ├── BracketScopeAdapter.ts    # Fallback for TS/JS/etc
│       └── index.ts                  # Barrel export
├── services/
│   ├── CompletionService.ts          # Unified completion service
│   └── index.ts                      # Barrel export
└── ui/
    ├── InlineDecorationManager.ts    # Visual diff decorations
    ├── DiffPreviewManager.ts         # Modal diff preview
    └── index.ts                      # Barrel export
```

### Modified Files

```
package.json                          # Commands, keybindings, config
src/config.ts                         # Completion config getter
src/extension.ts                      # Register new providers
src/prompts/provider.ts               # Integrate decorations
```

## Key Implementation Details

### 1. InlineDecorationManager

**Location:** `src/ui/InlineDecorationManager.ts`

**Purpose:** Manages visual diff decorations with strikethrough and ghost text.

**Critical Implementation Details:**

```typescript
showVisualDiff(editor, deleteRange, insertText) {
    // 1. Apply strikethrough to ENTIRE delete range (all lines)
    editor.setDecorations(this.deletionDecoration, [deleteRange]);

    // 2. CRITICAL: Ghost text must appear at END OF FIRST LINE
    //    NOT at deleteRange.end (would appear after last strikethrough)
    const firstLine = editor.document.lineAt(deleteRange.start.line);
    const firstLineEnd = firstLine.range.end;

    const insertDecoration = {
        range: new vscode.Range(firstLineEnd, firstLineEnd),
        renderOptions: {
            after: {
                contentText: insertText, // FULL replacement text
                color: new vscode.ThemeColor('editorGhostText.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 4px',
            }
        }
    };
    editor.setDecorations(this.insertionDecoration, [insertDecoration]);
}
```

**Key Features:**
- Two decoration types: `deletionDecoration` (strikethrough) and `insertionDecoration` (ghost text)
- Ghost text positioned at `firstLineEnd` (end of first line), NOT `deleteRange.end`
- Accept replaces ENTIRE range (all lines), not just first line
- Keyboard handlers: Tab (accept), Escape (reject)
- Document change listener for auto-cleanup
- Context key management: `llama-coder.inlineEditPending`
- Cursor position validation before accepting

### 2. ReplacementAnalyzer

**Location:** `src/prompts/ReplacementAnalyzer.ts`

**Purpose:** Orchestrates smart code replacement decisions using language-specific adapters.

**Decision Tree:**

1. Check if replacements enabled → No: Insert-only
2. Check if cursor is incomplete → Yes: Insert-only
3. Detect logical unit → None found: Try single-line replacement
4. Find replacement range → Not found: Insert-only
5. Calculate confidence → Below threshold: Insert-only
6. Success → Return replacement with metadata

**Threshold Logic for Visual Diff:**

```typescript
const showVisualDiff =
    replacedLines >= 2 ||      // Multi-line replacement
    confidence > 0.85 ||       // High confidence
    charDiff > 50;             // Large code change
```

**Confidence Scoring:**

```typescript
confidence = unit.baseConfidence;

// Adjustments:
if (similarity 30-70%): confidence += 0.2  // Partial match suggests refactoring
if (similarity > 90%):  confidence -= 0.3  // Very similar, might be duplicate
if (indent matches):    confidence += 0.1  // Indent levels match
```

### 3. Scope Adapters

**YamlScopeAdapter** (`src/prompts/scope-adapters/YamlScopeAdapter.ts`)

Detects YAML key-value blocks and list items using indentation.

**Critical Fix for Replacement Detection:**

```typescript
isIncomplete(context) {
    // Special case: If typing a new key before existing key - this is replacement!
    const typingKeyMatch = textBeforeCursor.match(/^\s*([a-zA-Z_][\w.-]*)$/);
    if (typingKeyMatch) {
        const existingKeyAfter = textAfterCursor.match(/^([a-zA-Z_][\w.-]*)\s*:/);
        if (existingKeyAfter) {
            return false; // This is replacement scenario, NOT incomplete
        }
    }
}
```

**PythonScopeAdapter** (`src/prompts/scope-adapters/PythonScopeAdapter.ts`)

Detects Python functions, classes, blocks, and decorators.

**BracketScopeAdapter** (`src/prompts/scope-adapters/BracketScopeAdapter.ts`)

Conservative fallback for TypeScript/JavaScript. Only handles incompleteness detection, defers to single-line replacement.

## Configuration

### New Settings

**`completion.enableReplacements`** (boolean, default: `false`)
- Enable smart replacement mode
- When true, completions may replace existing code instead of just inserting
- Useful for refactoring (e.g., `shell:` → `ansible.builtin.shell:`)
- Supports YAML and Python with language-aware scope detection

**`completion.minConfidence`** (number, default: `0.6`, range: 0-1)
- Minimum confidence required to replace code
- Lower values (0.4-0.6) = more aggressive replacement
- Higher values (0.7-0.9) = more conservative, only replace when very confident

### Commands

- `llama-coder.acceptInlineEdit` - Accept inline visual diff
- `llama-coder.rejectInlineEdit` - Reject inline visual diff

### Keybindings

- **Tab** → Accept inline edit (when `llama-coder.inlineEditPending`)
- **Escape** → Reject inline edit (when `llama-coder.inlineEditPending`)

## Testing Scenarios

### Primary Test Case: Ansible YAML

**Scenario:** Multi-line shell command → single-line ansible.builtin.shell

**Before:**
```yaml
  - name: test
    shell: |
      echo "multi"
      echo "line"
      echo "command"
```

**User types:** `ansible.builtin.` at the start of line 2

**Expected Behavior:**
1. Red strikethrough appears on all 5 lines of the `shell:` block
2. Green ghost text appears at end of line 2: `ansible.builtin.shell: echo "single line"`
3. User presses Tab → All 5 lines replaced with single line
4. User presses Escape → Decorations cleared, original code unchanged

**Configuration Required:**
```json
{
    "completion.enableReplacements": true,
    "completion.minConfidence": 0.6
}
```

### Secondary Test Cases

**1. Python Function Replacement**

```python
def old_function_name():
    pass
```

Type `new_function_name` at start → Should show visual diff if multi-line function body.

**2. YAML List Item Replacement**

```yaml
- item: old_value
  nested: value
```

Type `new_item` → Should show visual diff for multi-line item.

**3. Single-line Partial Word**

```yaml
shell: echo "test"
```

Type `ansible.builtin.` → Should use standard ghost text (no decorations) if single-line threshold not met.

## Edge Cases Handled

1. **Rapid typing** - Clear old decorations before applying new ones
2. **Document edits** - Auto-clear decorations if user manually edits inside decorated range
3. **Cursor movement** - Validate cursor position before accepting
4. **Active editor mismatch** - Fall back to standard completion if active editor doesn't match
5. **Multi-cursor** - Scoped to single active cursor (Phase 1)

## Performance Targets

- **Decoration application:** <50ms
- **Decoration cleanup:** <10ms
- **ReplacementAnalyzer analysis:** <20ms
- **Total overhead:** <100ms

## Known Limitations

1. **Multi-cursor support** - Not yet implemented (scoped to single cursor)
2. **Embedded languages** - Limited support (e.g., Python in Jinja templates)
3. **Complex nesting** - May struggle with deeply nested structures
4. **Partial edits** - Document changes outside decorated range don't trigger cleanup

## Future Enhancements

1. **Configuration options:**
   - `completion.showVisualDiff` - Toggle visual diff on/off
   - `completion.visualDiffThreshold` - Customize line threshold

2. **Language support:**
   - JSON/JSONC adapter
   - Markdown adapter
   - Shell script adapter

3. **UI improvements:**
   - Diff statistics (e.g., "-5 lines, +1 line")
   - Preview on hover
   - Color customization

4. **Performance:**
   - Cache scope analysis results
   - Debounce decoration updates
   - Async decoration application

## Testing Checklist

- [ ] Enable `completion.enableReplacements` in settings
- [ ] Set `completion.minConfidence` to 0.6
- [ ] Test Ansible YAML multi-line → single-line replacement
- [ ] Verify red strikethrough appears on all replaced lines
- [ ] Verify green ghost text appears at end of first line
- [ ] Test Tab to accept → All lines replaced correctly
- [ ] Test Escape to reject → Decorations cleared
- [ ] Test document edit during pending → Auto-cleanup works
- [ ] Test rapid typing → Old decorations cleared
- [ ] Test single-line partial word → Standard ghost text (no decorations)
- [ ] Check performance: decorations apply in <50ms
- [ ] Verify no memory leaks after multiple accepts/rejects

## Troubleshooting

### Visual diff not showing

1. Check `completion.enableReplacements` is `true`
2. Check completion meets threshold (multi-line OR high confidence OR large change)
3. Check logs for "showVisualDiff: true" message
4. Verify active editor matches completion document

### Decorations not clearing

1. Check document change listener is registered
2. Verify keyboard handlers are disposed properly
3. Check context key is being set/cleared

### Tab/Escape not working

1. Verify context key `llama-coder.inlineEditPending` is set
2. Check keybindings in package.json
3. Ensure no conflicting keybindings

### Replacement confidence too low

1. Lower `completion.minConfidence` (try 0.4-0.5)
2. Check logs for confidence score
3. Verify logical unit is being detected
4. Check similarity scoring

## Related Documentation

- [Plan File](../home/dfischer/.claude/plans/eager-twirling-lark.md) - Original implementation plan
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [CHANGELOG.md](../CHANGELOG.md) - Version history

## Commit Information

**Branch:** `feat/inline-visual-diff`
**Commit:** `06c5a28`
**Message:** "feat: implement inline visual diff decorations and smart replacement system"

**Files Changed:** 19 files, 3597 insertions(+), 80 deletions(-)

**New Files:**
- src/prompts/PromptBuilder.ts
- src/prompts/ReplacementAnalyzer.ts
- src/prompts/ResponseParser.ts
- src/prompts/RewriteActionProvider.ts
- src/prompts/scope-adapters/* (5 files)
- src/services/* (2 files)
- src/ui/* (3 files)

**Modified Files:**
- package.json
- src/config.ts
- src/extension.ts
- src/prompts/provider.ts

## Next Steps

1. **Test with real Ansible scenarios**
   - Multi-line shell commands
   - YAML key replacements
   - List item modifications

2. **Gather feedback**
   - Performance measurements
   - Edge case discovery
   - UX improvements

3. **Iterate based on testing**
   - Adjust thresholds if needed
   - Fix bugs discovered
   - Optimize performance

4. **Consider additional features**
   - Configuration options for customization
   - Additional language adapters
   - Enhanced visual feedback
