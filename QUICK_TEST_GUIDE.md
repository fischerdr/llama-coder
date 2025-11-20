# Quick Test Guide - 5 Minutes

Test this branch in VSCode locally in under 5 minutes.

## Prerequisites (One-time Setup)

1. **Ollama installed and running:**

   ```bash
   # Check if Ollama is running
   curl http://localhost:11434/api/tags

   # If not installed, download from: https://ollama.ai
   # Then start it: ollama serve
   ```

2. **Install a small test model:**

   ```bash
   ollama pull stable-code:3b-code-q4_0
   ```

3. **Clone and setup the project:**

   ```bash
   git clone https://github.com/ex3ndr/llama-coder.git
   cd llama-coder
   git checkout fix/smart-filters-and-model-formatting
   yarn install
   ```

---

## Test in Debug Mode (Recommended - 5 minutes)

### Step 1: Compile & Launch (30 seconds)

```bash
# In terminal
cd llama-coder  # or wherever you cloned the repo
git checkout fix/smart-filters-and-model-formatting
yarn compile
```

Then in VSCode:

- Press `F5`
- Wait for Extension Development Host window to open

### Step 2: Test Smart Filters (2 minutes)

In Extension Development Host window:

**Test 1: Empty Line (30 seconds)**

1. Create new file: `test.py`
2. Press Enter to create empty line
3. ✅ **VERIFY:** No ghost text on empty line
4. Type: `def test():`
5. ✅ **VERIFY:** Ghost text appears on line with code

**Test 2: Autocomplete Menu (30 seconds)**

1. Type: `import math` + Enter
2. Type: `x = math.`
3. Press `Ctrl+Space` (opens VSCode menu)
4. ✅ **VERIFY:** VSCode menu shows, NO Llama Coder ghost text
5. Press `Esc`
6. Continue typing
7. ✅ **VERIFY:** Llama Coder ghost text now appears

**Test 3: Markdown Files (30 seconds)**

1. Create new file: `test.md`
2. Type: `# Hello`
3. ✅ **VERIFY:** No completions (unsupported language)
4. Switch back to `test.py`
5. ✅ **VERIFY:** Completions work again

### Step 3: Test Model Formatting (2 minutes)

**Test CodeLlama (1 minute)**

1. Settings (`Ctrl+,`) → Search "inference.model"
2. Select: `codellama:7b-code-q4_K_M`
3. In `test.py`, type: `def add(a, b):`
4. Press Enter
5. ✅ **VERIFY:** Completion appears
6. Accept completion (Tab)
7. ✅ **VERIFY:** No strange tokens like `<EOT>` in the code

**Test Stable Code (1 minute)**

1. Settings → "inference.model"
2. Select: `stable-code:3b-code-q4_0`
3. Type: `class Calculator:`
4. Press Enter
5. ✅ **VERIFY:** Completion appears
6. ✅ **VERIFY:** No tokens like `<fim_prefix>` in the code

### Step 4: Check Output (30 seconds)

1. In **original** VSCode window (not Extension Development Host):
   - Open Output panel: `Ctrl+Shift+U`
   - Select "Llama Coder" from dropdown

2. In Extension Development Host:
   - Place cursor on empty line (wait 1s)
   - Type on a line with code (wait 1s)

3. In Output panel:
   - ✅ **VERIFY:** Fewer "Running completion" messages
   - ✅ **VERIFY:** Empty line didn't trigger completion

---

## Test with VSIX Package (Alternative - 5 minutes)

### Step 1: Build & Install (2 minutes)

```bash
# Build package
yarn package

# Install (creates llama-coder-0.0.14.vsix)
code --install-extension llama-coder-0.0.14.vsix

# Reload VSCode
# Press F1 → "Developer: Reload Window"
```

### Step 2: Quick Test (2 minutes)

1. Open any Python file
2. Test empty line - ✅ No completion
3. Test with code - ✅ Completion works
4. Open markdown file - ✅ No completion

### Step 3: Uninstall (1 minute)

```bash
code --uninstall-extension ex3ndr.llama-coder
```

---

## Verify All Tests Pass (1 minute)

```bash
# Run all automated tests
yarn test

# Expected output:
# Test Suites: 4 passed, 4 total
# Tests:       65 passed, 65 total
```

---

## Results Summary

### ✅ What Should Work

**Smart Filters:**

- ✅ No completions on empty lines
- ✅ No completions when VSCode menu is open
- ✅ No completions in markdown/plaintext/log files
- ✅ Completions work normally in code files

**Model Formatting:**

- ✅ CodeLlama completions have no stop tokens (`<EOT>`, `<END>`, `<EOD>`)
- ✅ Stable Code completions have no FIM tokens (`<fim_prefix>`, etc.)
- ✅ DeepSeek completions work without `<END>` token

**Regressions:**

- ✅ All previous features still work
- ✅ Pause/resume works
- ✅ All 65 unit tests pass

### ❌ What Should NOT Happen

- ❌ Ghost text on empty lines
- ❌ Ghost text in markdown files
- ❌ Stop tokens in completions (like `<EOT>`, `<fim_prefix>`)
- ❌ Completions while VSCode menu is open
- ❌ Test failures

---

## Troubleshooting

**Extension not loading?**

```bash
rm -rf out/ && yarn compile
# Then press F5 again
```

**No completions at all?**

```bash
# Check Ollama
curl http://localhost:11434/api/tags

# Check model
ollama list

# Pull model if needed
ollama pull stable-code:3b-code-q4_0
```

**Tests failing?**

```bash
npx jest --clearCache
yarn install
yarn test
```

---

## Done? ✅

If all tests pass:

- ✅ Smart filters reduce unnecessary completions
- ✅ Model formatting improvements work
- ✅ No regressions
- ✅ Ready to merge!

For detailed testing, see `TESTING_CHECKLIST.md`
For development guide, see `DEVELOPMENT.md`
