#!/usr/bin/env bash
#
# Build Verification Script
#
# Verifies that the build output is correct and functional.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$PROJECT_ROOT"

echo ""
echo "Build Verification"
echo "=================="
echo ""

ERRORS=0

check() {
    echo -n "  $1... "
}

pass() {
    echo -e "${GREEN}OK${NC}"
}

fail() {
    echo -e "${RED}FAILED${NC}"
    ((ERRORS++)) || true
}

warn() {
    echo -e "${YELLOW}WARN${NC} - $1"
}

# Check dist directory exists
check "dist directory exists"
if [[ -d "dist" ]]; then
    pass
else
    fail
fi

# Check main entry point
check "Main entry point (dist/cli.js)"
if [[ -f "dist/cli.js" ]]; then
    pass
else
    fail
fi

# Check entry point is executable (has shebang)
check "Entry point has shebang"
if head -1 dist/cli.js 2>/dev/null | grep -q "^#!/"; then
    pass
else
    warn "No shebang found"
fi

# Check no TypeScript files in dist
check "No .ts files in dist"
if find dist -name "*.ts" -not -name "*.d.ts" 2>/dev/null | grep -q .; then
    fail
else
    pass
fi

# Check for source maps (optional)
check "Source maps exist"
if find dist -name "*.js.map" 2>/dev/null | grep -q .; then
    pass
else
    warn "No source maps"
fi

# Try to run the CLI with --help
check "CLI runs with --help"
if node dist/cli.js --help >/dev/null 2>&1; then
    pass
else
    fail
fi

# Check package.json bin entry
check "package.json bin entry points to dist/cli.js"
bin_path=$(node -p "require('./package.json').bin?.ruska || ''")
if [[ "$bin_path" == "dist/cli.js" ]]; then
    pass
else
    fail
fi

# Summary
echo ""
if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}Build verification FAILED with $ERRORS errors${NC}"
    exit 1
else
    echo -e "${GREEN}Build verification PASSED${NC}"
    exit 0
fi
