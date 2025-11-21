#!/bin/bash

# Comprehensive Ansible completion testing
# Tests various real-world Ansible scenarios

ENDPOINT="${OLLAMA_ENDPOINT:-http://molly.modmtrx.net:11434}"
MODEL="${OLLAMA_MODEL:-qwen2.5-coder:7b}"

echo "=================================================="
echo "Ansible Completion Scenarios"
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

# Helper function
test_completion() {
    local title="$1"
    local prefix="$2"
    local suffix="$3"
    local num_predict="${4:-100}"

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}$title${NC}"
    echo -e "${YELLOW}Tokens: $num_predict${NC}"
    echo ""

    local fim_prompt="<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>"

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

    echo -e "${CYAN}Result: $eval_count tokens | Done: $done_reason${NC}"
    echo ""
    echo "Completion:"
    echo "----------------------------------------"
    echo "$completion"
    echo "----------------------------------------"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# APT/Package Management
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║         APT/PACKAGE MANAGEMENT TESTS              ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "APT: Complete state parameter" \
    "---
- name: Install nginx
  apt:
    name: nginx
    " \
    "
    update_cache: yes" \
    50

test_completion \
    "APT: Complete package list" \
    "---
- name: Install packages
  apt:
    name:
      - git
      - " \
    "
      - curl
    state: present" \
    50

test_completion \
    "APT: Complete when condition" \
    "---
- name: Install nginx
  apt:
    name: nginx
    state: present
  when: " \
    "

- name: Start nginx
  service:
    name: nginx
    state: started" \
    75

# ═══════════════════════════════════════════════════════════════
# File/Template Operations
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          FILE/TEMPLATE OPERATIONS                 ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "File: Complete src path" \
    "---
- name: Copy config file
  copy:
    src: " \
    "
    dest: /etc/app/config.yml
    mode: '0644'" \
    50

test_completion \
    "Template: Complete template task" \
    "---
- name: Deploy nginx config
  template:
    src: templates/nginx.conf.j2
    dest: " \
    "
    owner: root
    group: root" \
    50

test_completion \
    "Lineinfile: Complete line parameter" \
    "---
- name: Update SSH config
  lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^PermitRootLogin'
    line: " \
    "
    state: present" \
    50

# ═══════════════════════════════════════════════════════════════
# Service Management
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║            SERVICE MANAGEMENT                     ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Service: Complete enabled parameter" \
    "---
- name: Start and enable nginx
  service:
    name: nginx
    state: started
    " \
    "

- name: Check nginx status
  command: systemctl status nginx" \
    50

test_completion \
    "Systemd: Complete daemon_reload" \
    "---
- name: Reload systemd
  systemd:
    name: myapp
    state: restarted
    " \
    "
  notify: restart app" \
    50

# ═══════════════════════════════════════════════════════════════
# Docker/Container Management
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          DOCKER/CONTAINER MANAGEMENT              ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Docker: Complete ports mapping" \
    "---
- name: Run web container
  docker_container:
    name: webapp
    image: nginx:latest
    ports:
      - \"" \
    "\"
    restart_policy: always" \
    50

test_completion \
    "Docker: Complete environment vars" \
    "---
- name: Run database
  docker_container:
    name: postgres
    image: postgres:13
    env:
      POSTGRES_DB: mydb
      " \
    "
    volumes:
      - postgres_data:/var/lib/postgresql/data" \
    75

test_completion \
    "Docker: Complete volumes" \
    "---
- name: Run app container
  docker_container:
    name: app
    image: myapp:latest
    volumes:
      - " \
    "
      - /var/log/app:/app/logs:rw
    state: started" \
    50

# ═══════════════════════════════════════════════════════════════
# Variables and Jinja2
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          VARIABLES AND JINJA2 TEMPLATES           ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Vars: Complete variable in command" \
    "---
- name: Create directory
  file:
    path: \"{{ " \
    " }}/data\"
    state: directory
    mode: '0755'" \
    50

test_completion \
    "Vars: Complete with_items loop" \
    "---
- name: Create users
  user:
    name: \"{{ item.name }}\"
    groups: \"{{ item.groups }}\"
  with_items:
    - name: alice
      " \
    "
    - name: bob
      groups: sudo" \
    50

test_completion \
    "Jinja2: Complete filter" \
    "---
- name: Set fact with filter
  set_fact:
    app_version: \"{{ package_version | " \
    " }}\"

- debug:
    msg: \"Version: {{ app_version }}\"" \
    50

# ═══════════════════════════════════════════════════════════════
# Handlers and Notifications
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          HANDLERS AND NOTIFICATIONS               ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Handler: Complete handler definition" \
    "---
- name: Deploy config
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  notify: " \
    "

handlers:
  - name: restart nginx
    service:
      name: nginx
      state: restarted" \
    50

test_completion \
    "Handler: Complete listen directive" \
    "---
handlers:
  - name: restart web services
    service:
      name: nginx
      state: restarted
    listen: " \
    "

  - name: reload php
    service:
      name: php-fpm
      state: reloaded" \
    50

# ═══════════════════════════════════════════════════════════════
# Conditionals and Loops
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          CONDITIONALS AND LOOPS                   ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Loop: Complete loop variable" \
    "---
- name: Install packages
  apt:
    name: \"{{ item }}\"
    state: present
  loop:
    - " \
    "
    - vim
    - htop" \
    50

test_completion \
    "When: Complete condition with ansible_facts" \
    "---
- name: Install firewalld on RHEL
  yum:
    name: firewalld
    state: present
  when: ansible_os_family == " \
    "

- name: Install ufw on Debian
  apt:
    name: ufw
    state: present" \
    50

test_completion \
    "Block: Complete rescue section" \
    "---
- name: Try to start service
  block:
    - name: Start nginx
      service:
        name: nginx
        state: started
  rescue:
    - name: " \
    "
      debug:
        msg: \"Failed to start nginx\"" \
    75

# ═══════════════════════════════════════════════════════════════
# Command and Shell
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          COMMAND AND SHELL TASKS                  ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Command: Complete args section" \
    "---
- name: Run setup script
  command: /opt/app/setup.sh
  args:
    " \
    "
    creates: /opt/app/.installed" \
    50

test_completion \
    "Shell: Complete register and changed_when" \
    "---
- name: Check app version
  shell: /usr/bin/app --version
  register: " \
    "
  changed_when: false

- debug:
    var: app_version.stdout" \
    50

# ═══════════════════════════════════════════════════════════════
# Role and Include
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          ROLES AND INCLUDES                       ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Include: Complete include_tasks with vars" \
    "---
- name: Include web setup
  include_tasks: setup-web.yml
  vars:
    " \
    "
    web_port: 8080

- name: Configure database" \
    50

test_completion \
    "Import: Complete import_role" \
    "---
- name: Apply common role
  import_role:
    name: " \
    "
  vars:
    common_packages:
      - curl
      - wget" \
    50

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ANSIBLE TESTS COMPLETED              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Summary:"
echo "• Check which scenarios produce focused completions (1-3 lines)"
echo "• Note which ones overshoot and generate too much"
echo "• Compare 50 vs 75 vs 100 token limits"
echo ""
