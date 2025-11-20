#!/bin/bash

# Debug script for HELM completion issue
# Testing different variations to understand why it returns empty

ENDPOINT="${OLLAMA_ENDPOINT:-http://molly.modmtrx.net:11434}"
MODEL="${OLLAMA_MODEL:-qwen2.5-coder:7b}"

echo "=================================================="
echo "HELM Completion Debug"
echo "=================================================="
echo "Endpoint: $ENDPOINT"
echo "Model: $MODEL"
echo ""

# Helper function
test_helm() {
    local title="$1"
    local prefix="$2"
    local suffix="$3"
    local num_predict="${4:-100}"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test: $title"
    echo "Tokens: $num_predict"
    echo ""

    # Build FIM prompt
    local fim_prompt="<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>"

    echo "Prefix:"
    echo "$prefix"
    echo ""
    echo "Suffix:"
    echo "$suffix"
    echo ""

    # Make API call
    local response=$(curl -s -X POST "${ENDPOINT}/api/generate" -d "{
        \"model\": \"${MODEL}\",
        \"prompt\": $(echo "$fim_prompt" | jq -Rs .),
        \"raw\": true,
        \"stream\": false,
        \"options\": {
            \"stop\": [\"<|endoftext|>\", \"<|fim_prefix|>\", \"<|fim_suffix|>\", \"<|fim_middle|>\"],
            \"num_predict\": ${num_predict},
            \"temperature\": 0.2
        }
    }")

    local completion=$(echo "$response" | jq -r '.response // empty')
    local eval_count=$(echo "$response" | jq -r '.eval_count // 0')
    local done_reason=$(echo "$response" | jq -r '.done_reason // "unknown"')

    echo "Result: $eval_count tokens | Done reason: $done_reason"
    echo ""
    echo "Completion:"
    echo "[$completion]"
    echo ""
}

# Test 1: Original HELM scenario from your logs
echo "═══════════════════════════════════════════════════"
echo "TEST 1: Original HELM scenario"
echo "═══════════════════════════════════════════════════"
test_helm \
    "Original with set_fact" \
    "---
- name: Install HELM
  set_fact:
    HELM" \
    "
    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

# Test 2: Simpler - just the variable name
echo "═══════════════════════════════════════════════════"
echo "TEST 2: Just variable completion"
echo "═══════════════════════════════════════════════════"
test_helm \
    "Just variable name" \
    "---
- name: Install HELM
  set_fact:
    HELM_BIN: " \
    "
    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

# Test 3: Without trailing newline in suffix
echo "═══════════════════════════════════════════════════"
echo "TEST 3: No leading newline in suffix"
echo "═══════════════════════════════════════════════════"
test_helm \
    "No newline prefix in suffix" \
    "---
- name: Install HELM
  set_fact:
    HELM" \
    "    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

# Test 4: Complete line with underscore
echo "═══════════════════════════════════════════════════"
echo "TEST 4: Complete after underscore"
echo "═══════════════════════════════════════════════════"
test_helm \
    "After HELM_" \
    "---
- name: Install HELM
  set_fact:
    HELM_" \
    "
    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

# Test 5: More context before
echo "═══════════════════════════════════════════════════"
echo "TEST 5: More context (full playbook)"
echo "═══════════════════════════════════════════════════"
test_helm \
    "Full playbook context" \
    "---
- hosts: localhost
  become: yes
  vars:
    install_path: /usr/local/bin
  tasks:
    - name: Install HELM
      set_fact:
        HELM" \
    "
        KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

# Test 6: Different variable name
echo "═══════════════════════════════════════════════════"
echo "TEST 6: Different variable (DOCKER instead of HELM)"
echo "═══════════════════════════════════════════════════"
test_helm \
    "DOCKER variable" \
    "---
- name: Install Docker
  set_fact:
    DOCKER" \
    "
    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

# Test 7: Without any suffix
echo "═══════════════════════════════════════════════════"
echo "TEST 7: No suffix context at all"
echo "═══════════════════════════════════════════════════"
test_helm \
    "No suffix" \
    "---
- name: Install HELM
  set_fact:
    HELM" \
    "" \
    100

# Test 8: Just completing the value part
echo "═══════════════════════════════════════════════════"
echo "TEST 8: Complete value after colon"
echo "═══════════════════════════════════════════════════"
test_helm \
    "After colon" \
    "---
- name: Install HELM
  set_fact:
    HELM_BIN:" \
    "
    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

# Test 9: With a space after HELM
echo "═══════════════════════════════════════════════════"
echo "TEST 9: With space after HELM"
echo "═══════════════════════════════════════════════════"
test_helm \
    "HELM with space" \
    "---
- name: Install HELM
  set_fact:
    HELM " \
    "
    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

# Test 10: Try with more realistic next line
echo "═══════════════════════════════════════════════════"
echo "TEST 10: More realistic next line"
echo "═══════════════════════════════════════════════════"
test_helm \
    "Realistic next task" \
    "---
- name: Install HELM
  set_fact:
    HELM" \
    "

- name: Install kubectl
  set_fact:
    KUBECTL_BIN: \"/usr/local/bin/kubectl\"" \
    100

echo "=================================================="
echo "Debug tests completed"
echo "=================================================="
