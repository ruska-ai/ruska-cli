#!/usr/bin/env bash
#
# Version Bump Script
#
# Usage: ./version-bump.sh [major|minor|patch|<version>]
#
# Examples:
#   ./version-bump.sh patch      # 1.0.0 -> 1.0.1
#   ./version-bump.sh minor      # 1.0.0 -> 1.1.0
#   ./version-bump.sh major      # 1.0.0 -> 2.0.0
#   ./version-bump.sh 2.0.0-beta.1  # Set specific version
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

current_version=$(node -p "require('./package.json').version")

echo ""
echo "Version Bump Script"
echo "==================="
echo "Current version: $current_version"
echo ""

if [[ $# -eq 0 ]]; then
    echo "Usage: $0 [major|minor|patch|<version>]"
    echo ""
    echo "Examples:"
    echo "  $0 patch         # Bump patch version"
    echo "  $0 minor         # Bump minor version"
    echo "  $0 major         # Bump major version"
    echo "  $0 2.0.0-beta.1  # Set specific version"
    exit 0
fi

bump_type="$1"

case "$bump_type" in
    major|minor|patch)
        echo -e "${BLUE}Bumping $bump_type version...${NC}"
        new_version=$(npm version "$bump_type" --no-git-tag-version --allow-same-version=false)
        new_version="${new_version#v}"
        ;;
    *)
        # Treat as explicit version
        if [[ "$bump_type" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$ ]]; then
            echo -e "${BLUE}Setting version to $bump_type...${NC}"
            npm version "$bump_type" --no-git-tag-version --allow-same-version=false
            new_version="$bump_type"
        else
            echo -e "${RED}Invalid version format: $bump_type${NC}"
            exit 1
        fi
        ;;
esac

echo ""
echo -e "${GREEN}Version bumped: $current_version -> $new_version${NC}"
echo ""
echo "Next steps:"
echo "  1. Update CHANGELOG.md with release notes"
echo "  2. Commit changes: git commit -am \"chore(cli): bump version to $new_version\""
echo "  3. Push to repository: git push origin <branch>"
echo "  4. Create tag: git tag cli-v$new_version"
echo "  5. Push tag: git push origin cli-v$new_version"
echo ""
