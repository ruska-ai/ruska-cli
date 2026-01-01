#!/usr/bin/env bash
#
# Emergency Rollback Script
#
# Usage: ./rollback.sh <version>
#
# This script deprecates a problematic version and instructs users
# to use a previous version.
#
# NOTE: npm does not allow unpublishing packages after 72 hours.
# This script deprecates the version instead.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cd "$PROJECT_ROOT"

PACKAGE_NAME=$(node -p "require('./package.json').name")

if [[ $# -eq 0 ]]; then
    echo ""
    echo "Emergency Rollback Script"
    echo "========================="
    echo ""
    echo "Usage: $0 <version-to-deprecate> [replacement-version]"
    echo ""
    echo "Examples:"
    echo "  $0 1.2.0              # Deprecate version 1.2.0"
    echo "  $0 1.2.0 1.1.0        # Deprecate 1.2.0, recommend 1.1.0"
    echo ""
    echo "Current published versions:"
    npm view "$PACKAGE_NAME" versions --json 2>/dev/null | head -20 || echo "Package not found or not yet published"
    exit 1
fi

VERSION_TO_DEPRECATE="$1"
REPLACEMENT_VERSION="${2:-}"

echo ""
echo "Emergency Rollback"
echo "=================="
echo "Package: $PACKAGE_NAME"
echo "Version to deprecate: $VERSION_TO_DEPRECATE"
if [[ -n "$REPLACEMENT_VERSION" ]]; then
    echo "Replacement version: $REPLACEMENT_VERSION"
fi
echo ""

# Check if version exists
if ! npm view "${PACKAGE_NAME}@${VERSION_TO_DEPRECATE}" version >/dev/null 2>&1; then
    echo -e "${RED}Version $VERSION_TO_DEPRECATE not found on npm${NC}"
    exit 1
fi

# Confirm action
echo -e "${YELLOW}WARNING: This will mark $VERSION_TO_DEPRECATE as deprecated.${NC}"
echo "Users will see a warning when installing this version."
echo ""
read -p "Are you sure? (type 'deprecate' to confirm): " confirm

if [[ "$confirm" != "deprecate" ]]; then
    echo "Cancelled"
    exit 0
fi

# Build deprecation message
if [[ -n "$REPLACEMENT_VERSION" ]]; then
    DEPRECATION_MSG="This version has critical issues. Please use version $REPLACEMENT_VERSION instead."
else
    DEPRECATION_MSG="This version has critical issues. Please use a previous stable version."
fi

# Deprecate the version
echo ""
echo -e "${BLUE}Deprecating ${PACKAGE_NAME}@${VERSION_TO_DEPRECATE}...${NC}"
npm deprecate "${PACKAGE_NAME}@${VERSION_TO_DEPRECATE}" "$DEPRECATION_MSG"

echo ""
echo -e "${GREEN}Version $VERSION_TO_DEPRECATE has been deprecated${NC}"
echo ""
echo "Next steps:"
echo "  1. Notify users via release channels"
echo "  2. Document the issue in CHANGELOG.md"
echo "  3. If within 72 hours, consider: npm unpublish ${PACKAGE_NAME}@${VERSION_TO_DEPRECATE}"
echo ""

# Option to delete git tag
echo ""
read -p "Delete git tag cli-v$VERSION_TO_DEPRECATE? (y/N): " delete_tag
if [[ "$delete_tag" =~ ^[Yy]$ ]]; then
    git tag -d "cli-v$VERSION_TO_DEPRECATE" 2>/dev/null || true
    git push origin --delete "cli-v$VERSION_TO_DEPRECATE" 2>/dev/null || true
    echo -e "${GREEN}Git tag deleted${NC}"
fi
