#!/usr/bin/env bash
#
# Pre-Publish Safety Check Script
#
# Performs comprehensive safety checks before publishing.
# Can be used standalone or as part of the main publish script.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

log_check() {
    echo -n "Checking: $1... "
}

log_pass() {
    echo -e "${GREEN}PASS${NC}"
}

log_fail() {
    echo -e "${RED}FAIL${NC} - $1"
    ((ERRORS++)) || true
}

log_warn() {
    echo -e "${YELLOW}WARN${NC} - $1"
    ((WARNINGS++)) || true
}

cd "$PROJECT_ROOT"

echo ""
echo "Pre-Publish Safety Checks"
echo "========================="
echo ""

# Check 1: No sensitive files in package
log_check "No sensitive files in package"
sensitive_patterns=(
    ".env"
    ".env.*"
    "*.pem"
    "*.key"
    "*.p12"
    "credentials*"
    "secrets*"
    ".npmrc"
    "auth.json"
)

found_sensitive=false
for pattern in "${sensitive_patterns[@]}"; do
    if npm pack --dry-run 2>&1 | grep -q "$pattern"; then
        found_sensitive=true
        break
    fi
done

if [[ "$found_sensitive" == "true" ]]; then
    log_fail "Sensitive files may be included in package"
else
    log_pass
fi

# Check 2: No TODO/FIXME in production code
log_check "No unresolved TODOs in source"
if grep -rn "TODO\|FIXME\|XXX\|HACK" source/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "__tests__" | head -5 | grep -q .; then
    log_warn "Found TODO/FIXME comments in source code"
else
    log_pass
fi

# Check 3: Version follows semver
log_check "Version follows semver"
version=$(node -p "require('./package.json').version")
if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$ ]]; then
    log_pass
else
    log_fail "Version '$version' does not follow semver"
fi

# Check 4: CHANGELOG updated
log_check "CHANGELOG exists"
if [[ -f "CHANGELOG.md" ]]; then
    log_pass
else
    log_warn "CHANGELOG.md not found"
fi

# Check 5: README exists
log_check "README exists"
if [[ -f "README.md" ]]; then
    log_pass
else
    log_fail "README.md not found"
fi

# Check 6: License file exists
log_check "LICENSE file exists"
if [[ -f "LICENSE" ]] || [[ -f "LICENSE.md" ]] || [[ -f "LICENSE.txt" ]]; then
    log_pass
else
    log_warn "LICENSE file not found"
fi

# Check 7: No console.log in production code
log_check "No debug console.log statements"
if grep -rn "console\.log" source/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "__tests__" | grep -v "// DEBUG" | head -3 | grep -q .; then
    log_warn "Found console.log statements in source code"
else
    log_pass
fi

# Check 8: TypeScript compiles without errors
log_check "TypeScript compilation"
if npm run build >/dev/null 2>&1; then
    log_pass
else
    log_fail "TypeScript compilation failed"
fi

# Check 9: Package size is reasonable
log_check "Package size is reasonable"
pack_output=$(npm pack --dry-run 2>&1)
file_count=$(echo "$pack_output" | grep -oE 'total files:\s+[0-9]+' | grep -oE '[0-9]+' || echo "0")
if [[ "$file_count" -gt 100 ]]; then
    log_warn "Package contains $file_count files (consider reviewing)"
else
    log_pass
fi

# Check 10: Node engine specified
log_check "Node engine specified"
engines=$(node -p "JSON.stringify(require('./package.json').engines || {})")
if [[ "$engines" == "{}" ]]; then
    log_warn "No Node.js engine requirement specified"
else
    log_pass
fi

# Summary
echo ""
echo "========================="
echo "Summary"
echo "========================="
echo -e "Errors:   ${RED}${ERRORS}${NC}"
echo -e "Warnings: ${YELLOW}${WARNINGS}${NC}"
echo ""

if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}Pre-publish checks FAILED${NC}"
    exit 1
elif [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}Pre-publish checks passed with warnings${NC}"
    exit 0
else
    echo -e "${GREEN}All pre-publish checks PASSED${NC}"
    exit 0
fi
