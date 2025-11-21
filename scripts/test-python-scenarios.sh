#!/bin/bash

# Comprehensive Python completion testing
# Tests variables, code logic, and real-world scenarios

ENDPOINT="${OLLAMA_ENDPOINT:-http://molly.modmtrx.net:11434}"
MODEL="${OLLAMA_MODEL:-qwen2.5-coder:7b}"

echo "=================================================="
echo "Python Completion Scenarios"
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
# Variable Assignments and Literals
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          VARIABLE ASSIGNMENTS                     ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Variable: Complete string assignment" \
    "# Configuration
API_URL = " \
    "
DATABASE_URL = \"postgresql://localhost/mydb\"" \
    50

test_completion \
    "Variable: Complete list assignment" \
    "# Allowed file extensions
ALLOWED_EXTENSIONS = [" \
    "]

MAX_FILE_SIZE = 1024 * 1024  # 1MB" \
    50

test_completion \
    "Variable: Complete dictionary assignment" \
    "# Database configuration
db_config = {
    'host': 'localhost',
    'port': " \
    ",
    'database': 'myapp',
    'user': 'admin'
}" \
    50

test_completion \
    "Variable: Complete dict value" \
    "config = {
    'debug': True,
    'log_level': " \
    ",
    'timeout': 30
}" \
    50

test_completion \
    "Variable: Complete tuple unpacking" \
    "# Parse coordinate
x, y = " \
    "

print(f\"X: {x}, Y: {y}\")" \
    50

# ═══════════════════════════════════════════════════════════════
# Function Definitions and Parameters
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          FUNCTION DEFINITIONS                     ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Function: Complete parameter list" \
    "def process_user(name: str, " \
    ") -> dict:
    return {'name': name, 'age': age}" \
    50

test_completion \
    "Function: Complete default parameter" \
    "def create_user(username: str, email: str, active: bool = " \
    "):
    return User(username, email, active)" \
    50

test_completion \
    "Function: Complete return type annotation" \
    "def get_user_by_id(user_id: int) -> " \
    ":
    user = db.query(User).get(user_id)
    return user" \
    50

test_completion \
    "Function: Complete function body - variable" \
    "def calculate_total(items: list) -> float:
    total = " \
    "
    for item in items:
        total += item['price']
    return total" \
    50

test_completion \
    "Function: Complete function body - logic" \
    "def validate_email(email: str) -> bool:
    if " \
    ":
        return True
    return False" \
    75

# ═══════════════════════════════════════════════════════════════
# Class Definitions
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          CLASS DEFINITIONS                        ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Class: Complete __init__ parameter" \
    "class User:
    def __init__(self, username: str, " \
    "):
        self.username = username
        self.email = email" \
    50

test_completion \
    "Class: Complete instance variable" \
    "class Database:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.connection = " \
    "

    def connect(self):
        pass" \
    50

test_completion \
    "Class: Complete method definition" \
    "class Calculator:
    def add(self, a: int, b: int) -> int:
        return a + b

    def " \
    "

    def multiply(self, a: int, b: int) -> int:
        return a * b" \
    75

test_completion \
    "Class: Complete property decorator" \
    "class Person:
    def __init__(self, first_name: str, last_name: str):
        self._first_name = first_name
        self._last_name = last_name

    @property
    def full_name(self) -> str:
        return " \
    "

    @full_name.setter
    def full_name(self, value: str):
        pass" \
    50

# ═══════════════════════════════════════════════════════════════
# Control Flow and Logic
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          CONTROL FLOW AND LOGIC                   ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "If: Complete condition" \
    "def check_access(user):
    if " \
    ":
        return True
    return False" \
    50

test_completion \
    "If: Complete elif branch" \
    "def get_grade(score: int) -> str:
    if score >= 90:
        return 'A'
    elif " \
    ":
        return 'B'
    else:
        return 'F'" \
    50

test_completion \
    "For: Complete loop body" \
    "def process_items(items: list):
    results = []
    for item in items:
        " \
    "
        results.append(processed)
    return results" \
    75

test_completion \
    "List Comp: Complete comprehension" \
    "def get_even_squares(n: int) -> list:
    return [" \
    " for i in range(n)]" \
    50

test_completion \
    "Dict Comp: Complete comprehension" \
    "def create_lookup(items: list) -> dict:
    return {" \
    " for item in items}" \
    50

test_completion \
    "Try/Except: Complete except block" \
    "def safe_divide(a: int, b: int) -> float:
    try:
        return a / b
    except " \
    ":
        return 0.0
    finally:
        pass" \
    50

# ═══════════════════════════════════════════════════════════════
# Common Patterns and Idioms
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          COMMON PATTERNS AND IDIOMS               ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "With: Complete context manager" \
    "def read_config(filepath: str) -> dict:
    with open(filepath, 'r') as f:
        " \
    "
    return data" \
    50

test_completion \
    "Decorator: Complete decorator usage" \
    "@" \
    "
def expensive_operation():
    time.sleep(2)
    return \"result\"" \
    50

test_completion \
    "Lambda: Complete lambda function" \
    "# Sort users by age
users.sort(key=lambda " \
    ")

for user in users:
    print(user['name'])" \
    50

test_completion \
    "F-string: Complete formatted string" \
    "def greet(name: str, age: int):
    message = f\"" \
    "\"
    return message" \
    50

test_completion \
    "Match: Complete match case (Python 3.10+)" \
    "def handle_command(cmd: str):
    match cmd:
        case \"start\":
            return \"Starting...\"
        case " \
    ":
            return \"Stopping...\"
        case _:
            return \"Unknown command\"" \
    50

# ═══════════════════════════════════════════════════════════════
# Import Statements
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          IMPORT STATEMENTS                        ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Import: Complete from import" \
    "from typing import " \
    "

def process_items(items: List[str]) -> Dict[str, int]:
    pass" \
    50

test_completion \
    "Import: Complete import alias" \
    "import numpy as " \
    "

array = np.array([1, 2, 3])" \
    50

test_completion \
    "Import: Complete specific imports" \
    "from datetime import datetime, " \
    "

now = datetime.now()
delta = timedelta(days=1)" \
    50

# ═══════════════════════════════════════════════════════════════
# Data Processing and Operations
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          DATA PROCESSING OPERATIONS               ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Data: Complete filter operation" \
    "def filter_active_users(users: list) -> list:
    return [user for user in users if " \
    "]" \
    50

test_completion \
    "Data: Complete map operation" \
    "def extract_names(users: list) -> list:
    return list(map(" \
    ", users))" \
    50

test_completion \
    "Data: Complete reduce/aggregate" \
    "from functools import reduce

def sum_prices(items: list) -> float:
    return reduce(" \
    ", items, 0)" \
    75

test_completion \
    "Data: Complete dictionary access with default" \
    "def get_user_setting(user: dict, key: str):
    return user.get(" \
    ")" \
    50

test_completion \
    "Data: Complete string method chain" \
    "def clean_text(text: str) -> str:
    return text.strip()." \
    "

result = clean_text(\"  Hello World  \")" \
    50

# ═══════════════════════════════════════════════════════════════
# Testing and Assertions
# ═══════════════════════════════════════════════════════════════

echo -e "${YELLOW}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          TESTING AND ASSERTIONS                   ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

test_completion \
    "Test: Complete assertion" \
    "def test_calculate_total():
    result = calculate_total([10, 20, 30])
    assert " \
    "

def test_validate_email():
    pass" \
    50

test_completion \
    "Test: Complete pytest fixture" \
    "import pytest

@pytest.fixture
def " \
    ":
    return {\"host\": \"localhost\", \"port\": 5432}" \
    50

test_completion \
    "Test: Complete mock usage" \
    "from unittest.mock import Mock

def test_api_call():
    mock_client = Mock()
    mock_client.get.return_value = " \
    "

    result = fetch_data(mock_client)
    assert result is not None" \
    75

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              PYTHON TESTS COMPLETED               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Summary:"
echo "• Check variable completions for accuracy"
echo "• Note code logic completions (if/for/try)"
echo "• Compare focused vs. verbose completions"
echo "• Identify which token limits work best"
echo ""
