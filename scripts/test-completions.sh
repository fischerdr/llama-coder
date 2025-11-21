#!/bin/bash

# Test script for Ollama code completions
# Tests different scenarios with varying token limits and temperatures

ENDPOINT="${OLLAMA_ENDPOINT:-http://molly.modmtrx.net:11434}"
MODEL="${OLLAMA_MODEL:-qwen2.5-coder:7b}"

echo "=================================================="
echo "Ollama Completion Testing Script"
echo "=================================================="
echo "Endpoint: $ENDPOINT"
echo "Model: $MODEL"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to run a completion test
test_completion() {
    local scenario="$1"
    local prefix="$2"
    local suffix="$3"
    local num_predict="$4"
    local temperature="$5"

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Scenario: $scenario${NC}"
    echo -e "${YELLOW}Tokens: $num_predict | Temperature: $temperature${NC}"
    echo ""

    # Build the FIM prompt
    local fim_prompt="<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>"

    # Make the API call
    local response=$(curl -s -X POST "${ENDPOINT}/api/generate" -d "{
        \"model\": \"${MODEL}\",
        \"prompt\": $(echo "$fim_prompt" | jq -Rs .),
        \"raw\": true,
        \"stream\": false,
        \"options\": {
            \"stop\": [\"<|endoftext|>\", \"<|fim_prefix|>\", \"<|fim_suffix|>\", \"<|fim_middle|>\"],
            \"num_predict\": ${num_predict},
            \"temperature\": ${temperature}
        }
    }")

    # Extract the completion
    local completion=$(echo "$response" | jq -r '.response // empty')
    local eval_count=$(echo "$response" | jq -r '.eval_count // 0')
    local eval_duration=$(echo "$response" | jq -r '.eval_duration // 0')

    # Calculate tokens per second
    local tokens_per_sec=0
    if [ "$eval_duration" != "0" ]; then
        tokens_per_sec=$(echo "scale=2; $eval_count * 1000000000 / $eval_duration" | bc)
    fi

    # Count lines in completion
    local line_count=$(echo "$completion" | wc -l)

    echo -e "${YELLOW}Stats:${NC} $eval_count tokens in ${tokens_per_sec} tok/s | $line_count lines"
    echo ""
    echo -e "${GREEN}Completion:${NC}"
    echo "----------------------------------------"
    echo "$completion"
    echo "----------------------------------------"
    echo ""
}

# ================================================
# Python Tests
# ================================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          PYTHON COMPLETION TESTS               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Python Test 1: Simple function parameter
test_completion \
    "Python: Complete function parameters (50 tokens)" \
    "def process_user(name: str, " \
    "):\n    pass" \
    50 \
    0.2

test_completion \
    "Python: Complete function parameters (100 tokens)" \
    "def process_user(name: str, " \
    "):\n    pass" \
    100 \
    0.2

# Python Test 2: List comprehension
test_completion \
    "Python: Complete list comprehension (50 tokens)" \
    "def get_even_squares(n):\n    return [" \
    " for i in range(n)]" \
    50 \
    0.2

test_completion \
    "Python: Complete list comprehension (100 tokens)" \
    "def get_even_squares(n):\n    return [" \
    " for i in range(n)]" \
    100 \
    0.2

# Python Test 3: Class method
test_completion \
    "Python: Complete class method (100 tokens)" \
    "class DataProcessor:\n    def __init__(self, data):\n        self.data = data\n    \n    def filter_" \
    "\n        return result" \
    100 \
    0.2

test_completion \
    "Python: Complete class method (256 tokens)" \
    "class DataProcessor:\n    def __init__(self, data):\n        self.data = data\n    \n    def filter_" \
    "\n        return result" \
    256 \
    0.2

# ================================================
# Ansible/YAML Tests
# ================================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        ANSIBLE/YAML COMPLETION TESTS           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Ansible Test 1: set_fact variable (your original scenario)
test_completion \
    "Ansible: Complete set_fact HELM variable (50 tokens)" \
    "---\n- name: Install HELM\n  set_fact:\n    HELM" \
    "\n    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    50 \
    0.2

test_completion \
    "Ansible: Complete set_fact HELM variable (100 tokens)" \
    "---\n- name: Install HELM\n  set_fact:\n    HELM" \
    "\n    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100 \
    0.2

test_completion \
    "Ansible: Complete set_fact HELM variable (256 tokens)" \
    "---\n- name: Install HELM\n  set_fact:\n    HELM" \
    "\n    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    256 \
    0.2

# Ansible Test 2: Task parameters
test_completion \
    "Ansible: Complete apt task (50 tokens)" \
    "---\n- name: Install packages\n  apt:\n    name: nginx\n    " \
    "\n    update_cache: yes" \
    50 \
    0.2

test_completion \
    "Ansible: Complete apt task (100 tokens)" \
    "---\n- name: Install packages\n  apt:\n    name: nginx\n    " \
    "\n    update_cache: yes" \
    100 \
    0.2

# Ansible Test 3: Docker container config
test_completion \
    "Ansible: Complete docker_container (100 tokens)" \
    "---\n- name: Run web container\n  docker_container:\n    name: webapp\n    image: nginx:latest\n    " \
    "\n    restart_policy: always" \
    100 \
    0.2

# ================================================
# Bash Shell Script Tests
# ================================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         BASH SCRIPT COMPLETION TESTS           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Bash Test 1: Simple if statement
test_completion \
    "Bash: Complete if condition (50 tokens)" \
    "#!/bin/bash\nif [ " \
    " ]; then\n    echo \"File exists\"\nfi" \
    50 \
    0.2

test_completion \
    "Bash: Complete if condition (100 tokens)" \
    "#!/bin/bash\nif [ " \
    " ]; then\n    echo \"File exists\"\nfi" \
    100 \
    0.2

# Bash Test 2: Function definition
test_completion \
    "Bash: Complete function body (100 tokens)" \
    "#!/bin/bash\n\nfunction backup_files() {\n    local source=\"\$1\"\n    " \
    "\n    echo \"Backup completed\"\n}" \
    100 \
    0.2

test_completion \
    "Bash: Complete function body (256 tokens)" \
    "#!/bin/bash\n\nfunction backup_files() {\n    local source=\"\$1\"\n    " \
    "\n    echo \"Backup completed\"\n}" \
    256 \
    0.2

# Bash Test 3: For loop
test_completion \
    "Bash: Complete for loop (50 tokens)" \
    "#!/bin/bash\nfor file in " \
    "; do\n    echo \"Processing \$file\"\ndone" \
    50 \
    0.2

test_completion \
    "Bash: Complete for loop (100 tokens)" \
    "#!/bin/bash\nfor file in " \
    "; do\n    echo \"Processing \$file\"\ndone" \
    100 \
    0.2

# Bash Test 4: Case statement
test_completion \
    "Bash: Complete case option (50 tokens)" \
    "#!/bin/bash\ncase \"\$1\" in\n    start)\n        " \
    "\n        ;;\n    stop)\n        echo \"Stopping\"\n        ;;\nesac" \
    50 \
    0.2

# ================================================
# Temperature Comparison Tests
# ================================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        TEMPERATURE COMPARISON TESTS            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Test the same scenario with different temperatures
PREFIX="def calculate_average(numbers):\n    total = "
SUFFIX="\n    return total / len(numbers)"

test_completion \
    "Python: Temperature 0.0 (deterministic)" \
    "$PREFIX" \
    "$SUFFIX" \
    100 \
    0.0

test_completion \
    "Python: Temperature 0.2 (default)" \
    "$PREFIX" \
    "$SUFFIX" \
    100 \
    0.2

test_completion \
    "Python: Temperature 0.5 (creative)" \
    "$PREFIX" \
    "$SUFFIX" \
    100 \
    0.5

# ================================================
# Summary
# ================================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              TEST SUMMARY                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Key Findings:${NC}"
echo "- Compare completions at 50, 100, and 256 tokens"
echo "- Look for focused vs. expansive completions"
echo "- Check if suffix context helps constrain output"
echo "- Note which temperature gives best results"
echo ""
echo -e "${YELLOW}Recommendations:${NC}"
echo "- Use 50-100 tokens for single-statement completions"
echo "- Use 100-150 tokens for small blocks (2-5 lines)"
echo "- Use 256+ tokens for complete functions/blocks"
echo "- Use temperature 0.0-0.2 for focused completions"
echo "- Use temperature 0.3-0.5 for creative suggestions"
echo ""
echo "Test completed!"
