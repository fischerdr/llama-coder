# Quick Testing Guide: Inline Visual Diff

Branch: `feat/inline-visual-diff`
Status: Ready for Testing

## Setup

### 1. Install Extension

```bash
# From llama-coder directory
yarn compile
```

Then reload VS Code or press F5 to launch extension development host.

### 2. Enable Feature

Add to VS Code settings (`.vscode/settings.json` or User Settings):

```json
{
    "completion.enableReplacements": true,
    "completion.minConfidence": 0.6
}
```

### 3. Verify Backend

Ensure Ollama is running with a supported model:

```bash
ollama list  # Check installed models
ollama run deepseek-coder:6.7b-base  # Or your preferred model
```

## Test Scenarios

### Test 1: Multi-line YAML Replacement

**File:** `test.yml`

**Content:**
```yaml
---
- name: example task
  shell: |
    echo "line 1"
    echo "line 2"
    echo "line 3"
```

**Steps:**
1. Place cursor at start of line 3 (before `shell:`)
2. Type: `ansible.builtin.`
3. Wait for autocomplete

**Expected Result:**
- Red strikethrough on lines 3-6 (all 5 lines of shell block)
- Green ghost text at end of line 3: `ansible.builtin.shell: <completion>`
- Tab to accept → All 5 lines replaced
- Escape to reject → Decorations cleared

**Configuration Check:**
```bash
# Check logs in Output > Llama Coder
# Should see:
#   Replacement decision: Replace yaml-key-value-block 'shell' (confidence: 0.XX)
#   showVisualDiff: true (5 lines)
#   Showing visual diff with decorations
```

### Test 2: Single-line Partial Word

**File:** `test.yml`

**Content:**
```yaml
- name: example
  shell: echo "test"
```

**Steps:**
1. Place cursor after `shell` (before `:`)
2. Delete `shell`, type: `ansible.builtin.`
3. Wait for autocomplete

**Expected Result:**
- Standard ghost text (no visual diff decorations)
- Single line replacement
- Tab to accept → Standard completion behavior

**Why no visual diff?**
- Only 1 line being replaced (threshold is 2+ lines)
- Falls back to standard InlineCompletionItem

### Test 3: Rapid Typing

**File:** `test.yml`

**Content:**
```yaml
- name: example
  shell: |
    multi
    line
```

**Steps:**
1. Type `ansible.builtin.` → Visual diff appears
2. Immediately type more characters: `shell`
3. Watch decorations behavior

**Expected Result:**
- Old decorations cleared
- New decorations applied if new completion triggers
- No decoration artifacts left behind

### Test 4: Document Edit During Pending

**File:** `test.yml`

**Content:**
```yaml
- name: example
  shell: |
    multi
    line
```

**Steps:**
1. Type `ansible.builtin.` → Visual diff appears
2. Click somewhere else in the document
3. Edit a different line

**Expected Result:**
- Decorations automatically cleared
- Context key `llama-coder.inlineEditPending` set to false
- No decoration artifacts

## Debugging

### Enable Detailed Logs

1. Open Output panel (View > Output)
2. Select "Llama Coder" from dropdown
3. Watch for these log messages:

```
Replacement decision: <reason>
  shouldReplace: true/false, confidence: 0.XX
  logicalUnitType: yaml-key-value-block
  range: L2-L6
  showVisualDiff: true (5 lines)
Showing visual diff with decorations
```

### Common Issues

**Issue: Visual diff not showing**

Check:
1. `completion.enableReplacements` is `true`
2. Logs show `shouldReplace: true`
3. Logs show `showVisualDiff: true`
4. Multi-line replacement (2+ lines) OR high confidence (>0.85)

Fix:
- Lower `completion.minConfidence` to 0.4
- Verify completion is multi-line

**Issue: Tab/Escape not working**

Check:
1. Decorations are visible
2. Context key set: Run "Developer: Inspect Context Keys" (Cmd+Shift+P)
   - Look for `llama-coder.inlineEditPending: true`

Fix:
- Check keybindings in package.json
- Verify no conflicting keybindings

**Issue: Decorations not clearing**

Check:
1. Document change listener registered
2. Keyboard handlers disposed
3. Context key cleared

Fix:
- Reload VS Code
- Check for JavaScript errors in Developer Tools

**Issue: Wrong range being replaced**

Check:
1. Logs show correct range: `range: L2-L6`
2. YamlScopeAdapter finding correct block

Debug:
- Add breakpoint in `YamlScopeAdapter.findKeyValueBlockRange()`
- Check indent level matching

## Performance Testing

### Measure Decoration Application

Add timestamps in logs:

```typescript
// In InlineDecorationManager.showVisualDiff()
const start = Date.now();
// ... apply decorations ...
console.log(`Decorations applied in ${Date.now() - start}ms`);
```

**Target:** <50ms

### Measure Analysis Time

Add timestamps in logs:

```typescript
// In ReplacementAnalyzer.analyze()
const start = Date.now();
// ... analysis logic ...
console.log(`Analysis completed in ${Date.now() - start}ms`);
```

**Target:** <20ms

## Test Matrix

| Scenario | File Type | Lines | Expected | Status |
|----------|-----------|-------|----------|--------|
| Multi-line YAML key | .yml | 5 | Visual diff | ⏳ |
| Single-line YAML key | .yml | 1 | Ghost text | ⏳ |
| Python function | .py | 3+ | Visual diff | ⏳ |
| Python single line | .py | 1 | Ghost text | ⏳ |
| TypeScript function | .ts | 1 | Ghost text | ⏳ |
| Partial word | any | 1 | Ghost text | ⏳ |
| Rapid typing | .yml | 5 | Clean transition | ⏳ |
| Document edit | .yml | 5 | Auto-clear | ⏳ |
| Tab accept | .yml | 5 | Full replace | ⏳ |
| Escape reject | .yml | 5 | Clear only | ⏳ |

Legend: ⏳ Pending | ✅ Pass | ❌ Fail

## Reporting Issues

When reporting issues, include:

1. **Configuration:**
   ```json
   {
       "completion.enableReplacements": true/false,
       "completion.minConfidence": 0.X
   }
   ```

2. **File content** (before)

3. **User action** (what you typed)

4. **Expected behavior**

5. **Actual behavior**

6. **Logs from Output > Llama Coder** (relevant section)

7. **VS Code version**

8. **Extension version**

## Next Steps After Testing

1. Document actual behavior vs expected
2. Note any performance issues
3. Identify edge cases not covered
4. Suggest UX improvements
5. Report bugs with detailed reproduction steps

## Reference

- Implementation docs: `docs/INLINE_VISUAL_DIFF_IMPLEMENTATION.md`
- Plan file: `/home/dfischer/.claude/plans/eager-twirling-lark.md`
- Architecture: `docs/ARCHITECTURE.md`
