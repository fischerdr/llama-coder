# Testing Checklist: Smart Filters & Model Formatting

**Branch:** `fix/smart-filters-and-model-formatting`

Use this checklist to verify all improvements work correctly before merging.

---

## Quick Start

### Prerequisites
- [ ] Ollama is running: `curl http://localhost:11434/api/tags`
- [ ] At least one model is installed: `ollama pull stable-code:3b-code-q4_0`
- [ ] Branch is checked out: `git branch` shows `fix/smart-filters-and-model-formatting`
- [ ] Code is compiled: `yarn compile`

### Launch Extension
- [ ] Press `F5` in VSCode to start debugging
- [ ] Extension Development Host window opens
- [ ] Status bar shows "Llama Coder" (bottom right)

---

## ✅ Feature Tests

### 🎯 Smart Filters (#4)

#### Test 1: Empty Line Filter
- [ ] Open Python/TypeScript file
- [ ] Place cursor on completely empty line
- [ ] Wait 1 second
- [ ] **VERIFY:** No ghost text appears
- [ ] Type `def test():` on the line
- [ ] **VERIFY:** Ghost text now appears
- [ ] **PASS/FAIL:** ______

#### Test 2: Whitespace-Only Line Filter
- [ ] Create line with only spaces/tabs: `    `
- [ ] Place cursor at end
- [ ] Wait 1 second
- [ ] **VERIFY:** No ghost text appears
- [ ] **PASS/FAIL:** ______

#### Test 3: Autocomplete Menu Filter
- [ ] Type: `const x = Math.`
- [ ] Press `Ctrl+Space` to open VSCode menu
- [ ] **VERIFY:** VSCode menu appears
- [ ] **VERIFY:** NO Llama Coder ghost text
- [ ] Press `Esc` to close menu
- [ ] Continue typing
- [ ] **VERIFY:** Ghost text now appears
- [ ] **PASS/FAIL:** ______

#### Test 4: Markdown Files (Unsupported)
- [ ] Create new file: `test.md`
- [ ] Type: `# Hello World`
- [ ] Wait 1 second
- [ ] **VERIFY:** No completions
- [ ] Check status bar still shows "Llama Coder" (not paused)
- [ ] **PASS/FAIL:** ______

#### Test 5: Plaintext Files (Unsupported)
- [ ] Create new file: `test.txt`
- [ ] Type some text
- [ ] **VERIFY:** No completions
- [ ] **PASS/FAIL:** ______

#### Test 6: Log Files (Unsupported)
- [ ] Open/create file: `test.log`
- [ ] Type: `[INFO] message`
- [ ] **VERIFY:** No completions
- [ ] **PASS/FAIL:** ______

#### Test 7: Supported Languages Work
- [ ] Create `test.py` - **VERIFY:** Completions work
- [ ] Create `test.ts` - **VERIFY:** Completions work
- [ ] Create `test.js` - **VERIFY:** Completions work
- [ ] Create `test.java` - **VERIFY:** Completions work
- [ ] **PASS/FAIL:** ______

#### Test 8: Output Panel Shows Filtering
- [ ] Open Output panel: `Ctrl+Shift+U`
- [ ] Select "Llama Coder" from dropdown
- [ ] Place cursor on empty line
- [ ] **VERIFY:** No "Running completion" message
- [ ] Type code on non-empty line
- [ ] **VERIFY:** "Running completion" message appears
- [ ] **PASS/FAIL:** ______

---

### 🔧 Model Formatting (#5)

#### Test 9: CodeLlama - Template Optimization
- [ ] Settings → `inference.model` → Select `codellama:7b-code-q4_K_M`
- [ ] Wait for model to load if needed
- [ ] Open Python file
- [ ] Type: `def calculate(x, y):`
- [ ] Press Enter
- [ ] **VERIFY:** Completion appears
- [ ] Complete the function
- [ ] **VERIFY:** No errors, clean completion
- [ ] **PASS/FAIL:** ______

#### Test 10: CodeLlama - Stop Token Stripping
- [ ] Continue with CodeLlama model
- [ ] Request 5 different completions
- [ ] **VERIFY:** NO completions contain:
  - `<EOT>`
  - `<END>`
  - `<EOD>`
- [ ] **PASS/FAIL:** ______

#### Test 11: Stable Code - Stop Token Handling
- [ ] Settings → `inference.model` → Select `stable-code:3b-code-q4_0`
- [ ] Wait for model to load if needed
- [ ] Open JavaScript file
- [ ] Type: `function hello() {`
- [ ] Press Enter
- [ ] **VERIFY:** Completion appears
- [ ] Request 5 different completions
- [ ] **VERIFY:** NO completions contain:
  - `<|endoftext|>`
  - `<fim_prefix>`
  - `<fim_suffix>`
  - `<fim_middle>`
- [ ] **PASS/FAIL:** ______

#### Test 12: DeepSeek - Clean Stop Tokens
- [ ] Settings → `inference.model` → Select `deepseek-coder:6.7b-base-q4_K_M`
- [ ] Wait for model to load if needed
- [ ] Open TypeScript file
- [ ] Type: `const greeting = "`
- [ ] **VERIFY:** String completion works
- [ ] Request 5 different completions
- [ ] **VERIFY:** NO completions contain:
  - `<｜fim▁begin｜>`
  - `<｜fim▁hole｜>`
  - `<｜fim▁end｜>`
  - `<END>` (should be removed)
- [ ] **PASS/FAIL:** ______

---

### 🔄 Regression Tests

#### Test 13: Jupyter Notebooks
- [ ] Open or create `.ipynb` file
- [ ] Create code cell
- [ ] Type: `import numpy as np`
- [ ] Press Enter
- [ ] **VERIFY:** Completions work in notebook
- [ ] **PASS/FAIL:** ______

#### Test 14: Pause/Resume
- [ ] Click "Llama Coder" in status bar
- [ ] **VERIFY:** Status changes to "$(sync-ignored) Llama Coder"
- [ ] Type code
- [ ] **VERIFY:** No completions
- [ ] Click status bar again
- [ ] **VERIFY:** Status changes back to "$(chip) Llama Coder"
- [ ] Type code
- [ ] **VERIFY:** Completions work
- [ ] **PASS/FAIL:** ______

#### Test 15: Cancellation
- [ ] Open large file (>1000 lines)
- [ ] Type to trigger completion
- [ ] **Immediately** type more (before completion appears)
- [ ] **VERIFY:** No error, no flicker
- [ ] **VERIFY:** New completion request starts
- [ ] **PASS/FAIL:** ______

#### Test 16: Multi-line Completions
- [ ] Type: `def complex_function(a, b, c):`
- [ ] Press Enter
- [ ] Wait for completion
- [ ] **VERIFY:** Multi-line completion appears
- [ ] **VERIFY:** Proper indentation
- [ ] **VERIFY:** Stops at appropriate point (not mid-block)
- [ ] **PASS/FAIL:** ______

---

### 📊 Performance Tests

#### Test 17: Inference Call Reduction
- [ ] Open Output panel ("Llama Coder")
- [ ] Clear output (trash icon)
- [ ] Perform these actions:
  1. Place cursor on empty line (wait 1s) - 5 times
  2. Open autocomplete menu (`Ctrl+Space`) - 5 times
  3. Edit markdown file - 5 times
  4. Type normal code in Python - 5 times
- [ ] Count "Running completion" messages in output
- [ ] **EXPECTED:** ~5 messages (only from normal code typing)
- [ ] **ACTUAL:** ______ messages
- [ ] **VERIFY:** Significant reduction from expected ~20 without filters
- [ ] **PASS/FAIL:** ______

#### Test 18: Response Time
- [ ] Type code that triggers completion
- [ ] Note time from typing to ghost text appearing
- [ ] **EXPECTED:** <2 seconds for small models
- [ ] **ACTUAL:** ______ seconds
- [ ] Repeat 5 times, average: ______ seconds
- [ ] **PASS/FAIL:** ______

---

## 🔍 Edge Cases

#### Test 19: Very Long Lines
- [ ] Create line with 500+ characters
- [ ] Trigger completion
- [ ] **VERIFY:** No errors
- [ ] **PASS/FAIL:** ______

#### Test 20: Special Characters
- [ ] Type code with emojis, unicode, special chars
- [ ] **VERIFY:** Completions work
- [ ] **PASS/FAIL:** ______

#### Test 21: File Switching
- [ ] Open 5 different files
- [ ] Switch between them rapidly
- [ ] **VERIFY:** Completions work in each
- [ ] **VERIFY:** No lingering completions from other files
- [ ] **PASS/FAIL:** ______

---

## 📝 Automated Tests

#### Test 22: Unit Tests
```bash
yarn test
```
- [ ] All tests pass (65 total)
- [ ] `filter.spec.ts`: 28 tests pass
- [ ] `models.spec.ts`: 22 tests pass
- [ ] `autocomplete.spec.ts`: 14 tests pass
- [ ] `detectLanguage.spec.ts`: 1 test pass
- [ ] **PASS/FAIL:** ______

#### Test 23: TypeScript Compilation
```bash
yarn compile
```
- [ ] No errors
- [ ] `out/` directory created with JS files
- [ ] **PASS/FAIL:** ______

#### Test 24: Linting
```bash
yarn lint
```
- [ ] No errors
- [ ] No warnings
- [ ] **PASS/FAIL:** ______

---

## 📋 Final Checks

#### Code Quality
- [ ] All unit tests pass
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Code compiles successfully

#### Functionality
- [ ] Smart filters work (empty lines, menu, languages)
- [ ] All three model formats work (CodeLlama, Stable Code, DeepSeek)
- [ ] Stop tokens are properly stripped
- [ ] No regressions (notebooks, pause/resume, cancellation)

#### Performance
- [ ] Inference calls reduced by ~20-30%
- [ ] Response time unchanged or improved
- [ ] No memory leaks (check Task Manager after 30 min use)

#### Documentation
- [ ] `CHANGELOG_FILTERS_AND_FORMATTING.md` complete
- [ ] `DEVELOPMENT.md` accurate
- [ ] Commit messages clear and descriptive

---

## 🎯 Test Results Summary

**Date Tested:** ________________

**Tester:** ________________

**Environment:**
- OS: ________________
- VSCode Version: ________________
- Node Version: ________________
- Ollama Version: ________________

**Overall Results:**
- Tests Passed: ______ / 24
- Tests Failed: ______
- Tests Skipped: ______

**Failed Tests (if any):**
1. ________________________________
2. ________________________________
3. ________________________________

**Notes/Issues:**
________________________________________
________________________________________
________________________________________

**Recommendation:**
- [ ] ✅ Ready to merge
- [ ] ⚠️ Minor issues found, but acceptable
- [ ] ❌ Major issues found, requires fixes

**Signature:** ________________

---

## Quick Test Commands

```bash
# Setup
git checkout fix/smart-filters-and-model-formatting
yarn install
yarn compile

# Run tests
yarn test                                    # All unit tests
npx jest src/prompts/filter.spec.ts         # Filter tests only
npx jest src/prompts/processors/models.spec.ts  # Model tests only
npx jest src/prompts/autocomplete.spec.ts   # Autocomplete tests only

# Code quality
yarn lint                                    # Check linting
yarn lint --fix                             # Auto-fix linting
yarn compile                                # Check compilation

# Build extension
yarn package                                # Create .vsix file

# Debug in VSCode
Press F5                                    # Start Extension Development Host
```

---

## Troubleshooting

**Issue: Extension not loading**
```bash
rm -rf out/
yarn compile
# Then press F5 again
```

**Issue: Ollama not responding**
```bash
curl http://localhost:11434/api/tags
ollama serve  # If not running
```

**Issue: Model not found**
```bash
ollama list
ollama pull stable-code:3b-code-q4_0
```

**Issue: Tests failing**
```bash
npx jest --clearCache
yarn install
yarn test
```

---

**Last Updated:** 2025-11-20
