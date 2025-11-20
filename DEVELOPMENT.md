# Local Development & Testing Guide

This guide covers how to develop, test, and debug the Llama Coder extension locally in VSCode.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Development Workflow](#development-workflow)
4. [Testing the Extension in VSCode](#testing-the-extension-in-vscode)
5. [Testing This Branch](#testing-this-branch-fixsmart-filters-and-model-formatting)
6. [Debugging](#debugging)
7. [Common Issues](#common-issues)

---

## Prerequisites

### Required Software

- **Node.js**: v18.x or higher
- **Yarn**: v1.22.x (package manager)
- **VSCode**: v1.84.0 or higher
- **Git**: For version control
- **Ollama**: For testing completions

### Installing Ollama

Download and install from: https://ollama.ai

```bash
# Verify Ollama is installed
ollama --version

# Start Ollama server
ollama serve
```

---

## Environment Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/ex3ndr/llama-coder.git
   cd llama-coder
   ```

2. **Install dependencies:**

   ```bash
   yarn install
   ```

3. **Verify setup:**

   ```bash
   # Compile TypeScript
   yarn compile

   # Run tests
   yarn test

   # Lint code
   yarn lint
   ```

---

## Development Workflow

### Project Structure

```
llama-coder/
├── src/                          # TypeScript source code
│   ├── extension.ts              # Extension entry point
│   ├── config.ts                 # Configuration management
│   ├── modules/                  # Utility modules
│   └── prompts/                  # Completion logic
│       ├── provider.ts           # VSCode InlineCompletionItemProvider
│       ├── autocomplete.ts       # Main completion logic
│       ├── filter.ts             # Completion filters
│       └── processors/           # Prompt processing
├── out/                          # Compiled JavaScript (git-ignored)
├── test/                         # Integration tests (if any)
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
└── jest.config.js                # Jest test configuration
```

### Common Commands

```bash
# Development
yarn compile              # Compile TypeScript to JavaScript
yarn watch               # Watch mode - auto-compile on changes

# Testing
yarn test                # Run all Jest unit tests
yarn test:watch          # Run tests in watch mode
npx jest <file>          # Run specific test file

# Code Quality
yarn lint                # Run ESLint
yarn lint --fix          # Auto-fix linting issues

# Packaging
yarn package             # Build .vsix extension package
```

### Making Changes

1. **Create a feature branch:**

   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** in `src/`

3. **Write tests** (unit tests in `.spec.ts` files alongside source)

4. **Run tests:**

   ```bash
   yarn test
   ```

5. **Compile and lint:**

   ```bash
   yarn compile
   yarn lint
   ```

6. **Commit changes:**

   ```bash
   git add .
   git commit -m "feat: description of changes"
   ```

---

## Testing the Extension in VSCode

There are three ways to test the extension in VSCode:

### Method 1: Debug Mode (Best for Development)

This runs the extension in a new VSCode window (Extension Development Host).

**Steps:**

1. **Open the project in VSCode:**

   ```bash
   code .  # or code /path/to/llama-coder
   ```

2. **Compile the extension:**

   ```bash
   yarn compile
   ```

   Or start watch mode:

   ```bash
   yarn watch
   ```

3. **Start debugging:**

   - Press `F5` or select "Run > Start Debugging"
   - Or press `Ctrl+Shift+D` to open Run panel, then click "Run Extension"

4. **Extension Development Host window opens:**

   - New VSCode window with title "[Extension Development Host]"
   - Your extension is loaded and active
   - Status bar shows "Llama Coder" (bottom right)

5. **Test the extension:**

   - Open a code file (e.g., `.py`, `.ts`, `.js`)
   - Start typing code
   - Watch for auto-completions (ghost text)

6. **View debug output:**

   - In the **original** VSCode window (not Extension Development Host)
   - Open "Output" panel (`Ctrl+Shift+U`)
   - Select "Llama Coder" from dropdown
   - See logs: "Llama Coder started", "Running completion", etc.

7. **Stop debugging:**

   - Close the Extension Development Host window
   - Or press `Shift+F5` in original window

**Advantages:**
- ✅ Instant feedback
- ✅ Hot reload (with watch mode)
- ✅ Full debugging support (breakpoints, console logs)
- ✅ No installation required

**Disadvantages:**
- ❌ Runs in separate window
- ❌ Requires keeping both windows open

---

### Method 2: Install VSIX Package (Best for Testing)

This installs the extension into your actual VSCode instance.

**Steps:**

1. **Package the extension:**

   ```bash
   yarn package
   ```

   This creates: `llama-coder-<version>.vsix`

2. **Install the VSIX:**

   **Option A: Command Line**
   ```bash
   code --install-extension llama-coder-0.0.14.vsix
   ```

   **Option B: VSCode UI**
   - Open VSCode
   - Go to Extensions panel (`Ctrl+Shift+X`)
   - Click the `...` menu (top right)
   - Select "Install from VSIX..."
   - Browse to the `.vsix` file

3. **Reload VSCode:**

   - Press `F1` → "Developer: Reload Window"
   - Or restart VSCode

4. **Verify installation:**

   - Check Extensions panel for "Llama Coder"
   - Status bar should show "Llama Coder" (bottom right)

5. **Test the extension:**

   - Open any code file
   - Start typing
   - Watch for completions

6. **Uninstall when done:**

   - Extensions panel → Llama Coder → Uninstall
   - Or: `code --uninstall-extension ex3ndr.llama-coder`

**Advantages:**
- ✅ Tests in real environment
- ✅ No separate window
- ✅ Persists across sessions

**Disadvantages:**
- ❌ No live debugging
- ❌ Must rebuild and reinstall for each change
- ❌ Can conflict with published version

---

### Method 3: Side-by-Side Testing (Best for Comparing)

Test the extension alongside the published version.

**Steps:**

1. **Install published version** (if not already):

   ```bash
   code --install-extension ex3ndr.llama-coder
   ```

2. **Open two VSCode windows:**

   - Window 1: Regular VSCode (with published extension)
   - Window 2: Extension Development Host (with your branch)

3. **Test the same scenario in both:**

   - Compare behavior
   - Verify improvements

---

## Testing This Branch: `fix/smart-filters-and-model-formatting`

### Setup

1. **Ensure Ollama is running:**

   ```bash
   # Check if Ollama is running
   curl http://localhost:11434/api/tags

   # If not, start Ollama
   ollama serve
   ```

2. **Pull a test model:**

   ```bash
   # Recommended for testing (small, fast)
   ollama pull stable-code:3b-code-q4_0

   # Or other models
   ollama pull codellama:7b-code-q4_K_M
   ollama pull deepseek-coder:6.7b-base-q4_K_M
   ```

3. **Switch to the branch:**

   ```bash
   git checkout fix/smart-filters-and-model-formatting
   ```

4. **Install and compile:**

   ```bash
   yarn install
   yarn compile
   ```

### Test Plan

#### A. Test Smart Filters (#4)

**Test 1: Empty Line Filter**

1. Start extension in debug mode (`F5`)
2. Open Extension Development Host
3. Create a new Python file: `test_filters.py`
4. Place cursor on an **empty line**
5. **Expected:** No completion should trigger (no ghost text)
6. Type some code: `def hello():`
7. Press Enter to create new line
8. **Expected:** Completion should trigger on the line with code

**Test 2: Autocomplete Menu Filter**

1. Open a TypeScript file
2. Type: `const x = Math.`
3. Trigger VSCode autocomplete: `Ctrl+Space`
4. **Expected:** VSCode menu shows, but NO ghost text from Llama Coder
5. Press `Esc` to close menu
6. Continue typing without triggering menu
7. **Expected:** Llama Coder ghost text should appear

**Test 3: Language Filter**

1. Create a new Markdown file: `test.md`
2. Type: `# Hello World`
3. **Expected:** No completions (Llama Coder disabled for markdown)
4. Check status bar: Should show "Llama Coder" (not paused)
5. Create a Python file: `test.py`
6. Type: `def foo():`
7. **Expected:** Completions should work (Python is supported)

**Test 4: Unsupported File Types**

Test each of these file types - completions should NOT trigger:

- `.txt` (plaintext)
- `.log` (log files)
- `.diff` (diff files)
- Git commit message (when using `git commit` in terminal)

**Verification:**

Check the Output panel ("Llama Coder"):
- Should see fewer "Running completion" messages
- Should see messages like "Skipping: empty line" or "Skipping: unsupported language"

---

#### B. Test Model Formatting (#5)

**Test 5: CodeLlama - Optimized Template**

1. Configure CodeLlama model:
   - Open Settings (`Ctrl+,`)
   - Search: "inference.model"
   - Select: `codellama:7b-code-q4_K_M`

2. Open a Python file
3. Type: `def calculate(x):`
4. Press Enter, type: `return x`
5. **Expected:** Completion appears without issues
6. Check Output panel for prompt format (if logging enabled)

**Test 6: Stable Code - Stop Token Handling**

1. Configure Stable Code model:
   - Settings → "inference.model"
   - Select: `stable-code:3b-code-q4_0`

2. Open a JavaScript file
3. Type: `function test() {`
4. **Expected:** Completion should NOT contain `<fim_prefix>` or `<fim_suffix>` tokens
5. Complete multiple requests to verify

**Test 7: DeepSeek - Clean Stop Tokens**

1. Configure DeepSeek model:
   - Settings → "inference.model"
   - Select: `deepseek-coder:6.7b-base-q4_K_M`

2. Open a TypeScript file
3. Type: `const greeting = "`
4. **Expected:** Completion should work without `<END>` token issues
5. Test multiple completions

**Test 8: Dynamic Stop Token Stripping**

1. Test with all three models (CodeLlama, Stable Code, DeepSeek)
2. For each model:
   - Request multiple completions
   - Verify NO stop tokens appear in results
   - Example unwanted tokens:
     - CodeLlama: `<EOT>`, `<END>`, `<EOD>`
     - Stable Code: `<|endoftext|>`, `<fim_prefix>`, etc.
     - DeepSeek: `<｜fim▁begin｜>`, `<｜fim▁hole｜>`, etc.

---

#### C. Regression Testing

Ensure existing features still work:

**Test 9: Jupyter Notebooks**

1. Open a `.ipynb` file
2. Create a code cell
3. Type code
4. **Expected:** Completions should work

**Test 10: Remote Files** (if applicable)

1. Open a remote file (SSH, WSL, etc.)
2. **Expected:** Completions should work

**Test 11: Cancellation**

1. Open a large file
2. Start typing to trigger completion
3. **Immediately** start typing more (before completion appears)
4. **Expected:** Request should cancel, no ghost text flicker

**Test 12: Pause/Resume**

1. Click "Llama Coder" in status bar
2. **Expected:** Status changes to "$(sync-ignored) Llama Coder" (paused)
3. Try typing code
4. **Expected:** No completions
5. Click status bar again
6. **Expected:** Resume, completions work again

---

### Performance Testing

**Test 13: Measure Inference Reduction**

1. **Before testing:**
   - Open Output panel ("Llama Coder")
   - Clear output

2. **Perform 20 actions:**
   - 5 times: Place cursor on empty line and wait 1 second
   - 5 times: Open autocomplete menu (`Ctrl+Space`)
   - 5 times: Edit a markdown file
   - 5 times: Normal code typing in Python/TS

3. **Count inference calls:**
   - Search Output for "Running completion"
   - **Expected:** ~5 calls (only for normal code typing)
   - **Old behavior would be:** ~20 calls

---

## Debugging

### Debugging the Extension

1. **Set breakpoints:**

   - Open source files in original VSCode window
   - Click left margin to set breakpoints
   - Red dots appear

2. **Start debugging:**

   - Press `F5`
   - Extension Development Host opens

3. **Trigger breakpoint:**

   - Perform action in Extension Development Host
   - Debugger pauses in original window

4. **Inspect variables:**

   - Hover over variables
   - Use Debug Console
   - Step through code (`F10`, `F11`)

### Debugging Tests

1. **Add to test file:**

   ```typescript
   it('should do something', () => {
     debugger; // Breakpoint
     expect(result).toBe(expected);
   });
   ```

2. **Run in debug mode:**

   - VSCode: Set breakpoint in test file
   - Run & Debug panel → "Jest: Debug Tests"
   - Or: `Ctrl+Shift+D` → "Jest Debug"

3. **Run specific test:**

   ```bash
   node --inspect-brk node_modules/.bin/jest src/prompts/filter.spec.ts
   ```

### View Extension Logs

**Output Panel:**

1. Open Output panel: `Ctrl+Shift+U`
2. Dropdown: Select "Llama Coder"
3. See logs in real-time

**Developer Console:**

1. Extension Development Host window
2. Help → Toggle Developer Tools
3. Console tab shows JavaScript logs

---

## Common Issues

### Issue 1: Extension Not Loading

**Symptoms:**
- No status bar item
- No completions

**Solutions:**
1. Check Output panel for errors
2. Verify compilation: `yarn compile`
3. Restart Extension Development Host
4. Check package.json activation events

### Issue 2: Compilation Errors

**Symptoms:**
- `yarn compile` fails
- TypeScript errors

**Solutions:**
```bash
# Clean and rebuild
rm -rf out/
yarn compile

# Check for missing types
yarn install
```

### Issue 3: Tests Failing

**Symptoms:**
- `yarn test` fails

**Solutions:**
```bash
# Run specific test to see details
npx jest src/prompts/filter.spec.ts --verbose

# Clear Jest cache
npx jest --clearCache

# Update snapshots (if applicable)
npx jest --updateSnapshot
```

### Issue 4: Ollama Connection

**Symptoms:**
- "Model not found" errors
- No completions appear

**Solutions:**
1. Check Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. Verify endpoint in settings:
   - Settings → "inference.endpoint"
   - Default: `http://127.0.0.1:11434`

3. Pull model:
   ```bash
   ollama pull stable-code:3b-code-q4_0
   ```

### Issue 5: Extension Conflicts

**Symptoms:**
- Two versions of extension running
- Unexpected behavior

**Solutions:**
1. Disable published version:
   - Extensions panel
   - Llama Coder → Disable

2. Or uninstall published version:
   ```bash
   code --uninstall-extension ex3ndr.llama-coder
   ```


---

## Advanced Topics

### Hot Reload During Development

1. Start watch mode:
   ```bash
   yarn watch
   ```

2. Start debugging (`F5`)

3. Make changes to source files

4. Reload Extension Development Host:
   - Press `Ctrl+R` in Extension Development Host window
   - Or: `F1` → "Developer: Reload Window"

### Testing Against Different VSCode Versions

Modify `package.json`:

```json
{
  "engines": {
    "vscode": "^1.90.0"
  }
}
```

Then rebuild and test.

### Running Integration Tests

If integration tests exist:

```bash
# Run integration tests (requires VSCode)
yarn test:integration
```

### Profiling Performance

1. Enable performance logging:
   ```typescript
   console.time('completion');
   // ... code ...
   console.timeEnd('completion');
   ```

2. Check Developer Console in Extension Development Host

---

## Tips & Best Practices

1. **Always run tests before committing:**
   ```bash
   yarn test && yarn lint && yarn compile
   ```

2. **Use watch mode for rapid iteration:**
   ```bash
   yarn watch
   ```

3. **Test with multiple models:**
   - CodeLlama
   - Stable Code
   - DeepSeek

5. **Monitor resource usage:**
   - VSCode: Help → Toggle Developer Tools → Performance
   - Check memory, CPU during completions

6. **Use the Output panel:**
   - Essential for debugging
   - Shows all extension logs

7. **Test edge cases:**
   - Very large files
   - Empty files
   - Files with special characters
   - Remote files
   - Notebooks

---

## Resources

- **VSCode Extension API:** https://code.visualstudio.com/api
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Jest Documentation:** https://jestjs.io/
- **Ollama API:** https://github.com/ollama/ollama/blob/main/docs/api.md
- **Project Architecture:** See `docs/ARCHITECTURE.md`
- **Changelog:** See `CHANGELOG_FILTERS_AND_FORMATTING.md`

---

## Getting Help

- **GitHub Issues:** https://github.com/ex3ndr/llama-coder/issues
- **Project README:** `README.md`
- **Architecture Docs:** `docs/ARCHITECTURE.md`

---

**Last Updated:** 2025-11-20
**Branch:** `fix/smart-filters-and-model-formatting`
