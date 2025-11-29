# Quick Start: Testing Inline Visual Diff

Branch: `feat/inline-visual-diff`

## 1. Enable the Feature

Add to your VS Code settings:

```json
{
    "completion.enableReplacements": true,
    "completion.minConfidence": 0.6
}
```

## 2. Create Test File

Create `test.yml`:

```yaml
---
- name: example task
  shell: |
    echo "line 1"
    echo "line 2"
    echo "line 3"
```

## 3. Test the Feature

1. Place cursor at start of line 3 (before `shell:`)
2. Type: `ansible.builtin.`
3. Wait for autocomplete

**Expected Result:**
- Red strikethrough on all 5 lines of the `shell:` block
- Green ghost text at end of line 3: `ansible.builtin.shell: <completion>`

## 4. Accept or Reject

- Press **Tab** → All 5 lines replaced with new code
- Press **Escape** → Decorations cleared, original unchanged

## 5. Check Logs

View Output > Llama Coder to see:

```
Replacement decision: Replace yaml-key-value-block 'shell' (confidence: 0.XX)
  shouldReplace: true, confidence: 0.XX
  logicalUnitType: yaml-key-value-block
  range: L3-L7
  showVisualDiff: true (5 lines)
Showing visual diff with decorations
```

## Documentation

- [TESTING_VISUAL_DIFF.md](TESTING_VISUAL_DIFF.md) - Full testing guide
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Implementation overview
- [docs/INLINE_VISUAL_DIFF_IMPLEMENTATION.md](docs/INLINE_VISUAL_DIFF_IMPLEMENTATION.md) - Technical details

## Troubleshooting

**Visual diff not showing?**
- Check `completion.enableReplacements` is `true`
- Verify you're editing a `.yml` file
- Lower `completion.minConfidence` to 0.4

**Tab/Escape not working?**
- Check decorations are visible first
- Run "Developer: Inspect Context Keys" and look for `llama-coder.inlineEditPending: true`

## Ready to Test!

The feature is fully implemented and ready for your testing. Report any issues with:
- Configuration used
- File content
- Expected vs actual behavior
- Logs from Output > Llama Coder
