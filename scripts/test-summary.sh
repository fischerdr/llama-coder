#!/bin/bash

# Quick summary test - focused scenarios at different token limits
# Tests 50, 100, and 150 tokens to find optimal settings

ENDPOINT="${OLLAMA_ENDPOINT:-http://molly.modmtrx.net:11434}"
MODEL="${OLLAMA_MODEL:-qwen2.5-coder:7b}"

echo "=================================================="
echo "Completion Quality Test - Token Limit Comparison"
echo "=================================================="
echo "Endpoint: $ENDPOINT"
echo "Model: $MODEL"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper
test_at_limits() {
    local scenario="$1"
    local prefix="$2"
    local suffix="$3"

    echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ $scenario"
    echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
    echo ""

    for tokens in 50 100 150; do
        echo -e "${YELLOW}► Testing with $tokens tokens...${NC}"

        local fim_prompt="<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>"

        local response=$(curl -s -X POST "${ENDPOINT}/api/generate" -d "{
            \"model\": \"${MODEL}\",
            \"prompt\": $(echo "$fim_prompt" | jq -Rs .),
            \"raw\": true,
            \"stream\": false,
            \"options\": {
                \"stop\": [\"<|endoftext|>\", \"<|fim_prefix|>\", \"<|fim_suffix|>\", \"<|fim_middle|>\"],
                \"num_predict\": ${tokens},
                \"temperature\": 0.2
            }
        }")

        local completion=$(echo "$response" | jq -r '.response // empty')
        local eval_count=$(echo "$response" | jq -r '.eval_count // 0')
        local line_count=$(echo "$completion" | wc -l)

        echo -e "${CYAN}  Generated: $eval_count tokens, $line_count lines${NC}"
        echo "  ┌─────────────────────────────────────"
        echo "$completion" | head -5 | sed 's/^/  │ /'
        if [ "$line_count" -gt 5 ]; then
            echo "  │ ... ($(($line_count - 5)) more lines)"
        fi
        echo "  └─────────────────────────────────────"
        echo ""
    done
}

# ═══════════════════════════════════════════════════════════════
# PYTHON TESTS
# ═══════════════════════════════════════════════════════════════

echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         PYTHON COMPLETION TESTS                    ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""

test_at_limits \
    "Python: Complete variable assignment           " \
    "# API configuration
API_KEY = " \
    "
BASE_URL = \"https://api.example.com\""

test_at_limits \
    "Python: Complete function parameter            " \
    "def send_email(to: str, subject: str, " \
    ") -> bool:
    return smtp.send(to, subject, body)"

test_at_limits \
    "Python: Complete list comprehension            " \
    "def filter_even(numbers):
    return [" \
    " for n in numbers]"

test_at_limits \
    "Python: Complete if condition                  " \
    "def is_valid(user):
    if " \
    ":
        return True
    return False"

# ═══════════════════════════════════════════════════════════════
# ANSIBLE TESTS
# ═══════════════════════════════════════════════════════════════

echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         ANSIBLE COMPLETION TESTS                   ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""

test_at_limits \
    "Ansible: Complete apt state parameter         " \
    "---
- name: Install nginx
  apt:
    name: nginx
    " \
    "
    update_cache: yes"

test_at_limits \
    "Ansible: Complete docker ports                 " \
    "---
- name: Run container
  docker_container:
    name: web
    image: nginx
    ports:
      - \"" \
    "\"
    restart_policy: always"

test_at_limits \
    "Ansible: Complete when condition               " \
    "---
- name: Install package
  apt:
    name: firewalld
    state: present
  when: " \
    "

- name: Start firewalld
  service:
    name: firewalld
    state: started"

test_at_limits \
    "Ansible: Complete with_items entry             " \
    "---
- name: Create users
  user:
    name: \"{{ item.name }}\"
    state: present
  with_items:
    - name: alice
      " \
    "
    - name: charlie
      shell: /bin/zsh"

# ═══════════════════════════════════════════════════════════════
# BASH TESTS
# ═══════════════════════════════════════════════════════════════

echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         BASH SCRIPT COMPLETION TESTS               ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""

test_at_limits \
    "Bash: Complete if condition                    " \
    "#!/bin/bash
if [ " \
    " ]; then
    echo \"File exists\"
fi"

test_at_limits \
    "Bash: Complete for loop                        " \
    "#!/bin/bash
for file in " \
    "; do
    echo \"Processing \$file\"
done"

test_at_limits \
    "Bash: Complete case option                     " \
    "#!/bin/bash
case \"\$1\" in
    start)
        " \
    "
        ;;
    stop)
        systemctl stop app
        ;;
esac"

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              RECOMMENDATIONS                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo "Based on the results above, recommended settings:"
echo ""
echo "• FOCUSED completions (1-3 lines):"
echo "    maxTokens: 50-75"
echo "    maxLines: 3-5"
echo ""
echo "• BALANCED completions (small blocks):"
echo "    maxTokens: 100-125"
echo "    maxLines: 5-7"
echo ""
echo "• COMPREHENSIVE completions (full blocks):"
echo "    maxTokens: 150-200"
echo "    maxLines: 10-15"
echo ""
echo "Current defaults in package.json:"
echo "    maxTokens: 100"
echo "    maxLines: 5"
echo ""
echo "These defaults should provide focused completions similar to Cursor."
echo ""
