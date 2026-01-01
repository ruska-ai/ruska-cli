#!/usr/bin/env bash
#
# Manual NPM Publish Script for @ruska/ruska-cli
#
# Usage: ./scripts/publish/publish.sh [--dry-run] [--skip-tests]
#
# This script provides a safe manual fallback for publishing when CI/CD fails.
# It includes comprehensive safety checks and requires explicit confirmation.
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PACKAGE_NAME="@ruska/ruska-cli"
REQUIRED_NODE_VERSION="18"
REQUIRED_BRANCH="main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
DRY_RUN=false
SKIP_TESTS=false
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run     Perform all checks but do not publish"
            echo "  --skip-tests  Skip running tests (not recommended)"
            echo "  --force       Skip confirmation prompts (use with caution)"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verify prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Node.js
    if ! command_exists node; then
        log_error "Node.js is not installed"
        exit 1
    fi

    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_version" -lt "$REQUIRED_NODE_VERSION" ]]; then
        log_error "Node.js version must be >= $REQUIRED_NODE_VERSION (found: $node_version)"
        exit 1
    fi
    log_success "Node.js version: $(node -v)"

    # Check npm
    if ! command_exists npm; then
        log_error "npm is not installed"
        exit 1
    fi
    log_success "npm version: $(npm -v)"

    # Check npm authentication
    if ! npm whoami >/dev/null 2>&1; then
        log_error "Not logged in to npm. Run 'npm login' first."
        exit 1
    fi
    log_success "Logged in as: $(npm whoami)"

    # Check 2FA status
    local tfa_status
    tfa_status=$(npm profile get --json 2>/dev/null | grep -o '"tfa":{"mode":"[^"]*"' | sed 's/.*"mode":"\([^"]*\)"/\1/' || echo "unknown")
    if [[ "$tfa_status" == "auth-and-writes" ]]; then
        log_success "2FA is enabled for auth and writes"
    elif [[ "$tfa_status" == "auth-only" ]]; then
        log_warn "2FA is only enabled for auth (consider enabling for writes)"
    else
        log_warn "2FA status unknown - please verify manually"
    fi

    # Check git
    if ! command_exists git; then
        log_error "git is not installed"
        exit 1
    fi
    log_success "git version: $(git --version)"
}

# Verify git state
check_git_state() {
    log_info "Checking git state..."

    cd "$PROJECT_ROOT"

    # Check for uncommitted changes
    if [[ -n "$(git status --porcelain)" ]]; then
        log_error "Working directory has uncommitted changes"
        git status --short
        exit 1
    fi
    log_success "Working directory is clean"

    # Check current branch
    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    if [[ "$current_branch" != "$REQUIRED_BRANCH" ]] && [[ "$FORCE" != "true" ]]; then
        log_error "Must be on '$REQUIRED_BRANCH' branch (currently on '$current_branch')"
        log_info "Use --force to override (not recommended)"
        exit 1
    fi
    log_success "Current branch: $current_branch"

    # Check if branch is up to date with remote
    git fetch origin "$REQUIRED_BRANCH" --quiet 2>/dev/null || true
    local local_hash
    local_hash=$(git rev-parse HEAD)
    local remote_hash
    remote_hash=$(git rev-parse "origin/$REQUIRED_BRANCH" 2>/dev/null || echo "")

    if [[ -n "$remote_hash" ]] && [[ "$local_hash" != "$remote_hash" ]]; then
        log_error "Local branch is not in sync with remote"
        log_info "Run 'git pull origin $REQUIRED_BRANCH' first"
        exit 1
    fi
    log_success "Branch is up to date with remote"

    # Check if version tag already exists
    local version
    version=$(node -p "require('./package.json').version")
    if git tag -l "cli-v$version" | grep -q "cli-v$version"; then
        log_error "Git tag cli-v$version already exists"
        exit 1
    fi
    log_success "Version cli-v$version is not yet tagged"
}

# Verify package.json
check_package_json() {
    log_info "Checking package.json..."

    cd "$PROJECT_ROOT"

    # Check package name
    local name
    name=$(node -p "require('./package.json').name")
    log_info "Package name: $name"

    # Check version
    local version
    version=$(node -p "require('./package.json').version")
    log_info "Package version: $version"

    # Check if version is already published
    if npm view "${name}@${version}" version >/dev/null 2>&1; then
        log_error "Version $version is already published to npm"
        exit 1
    fi
    log_success "Version $version is not yet published"

    # Check required fields
    local description
    description=$(node -p "require('./package.json').description || ''")
    if [[ -z "$description" ]]; then
        log_warn "Package description is missing"
    fi

    local license
    license=$(node -p "require('./package.json').license || ''")
    if [[ -z "$license" ]]; then
        log_warn "Package license is missing"
    fi

    # Check files field
    local files
    files=$(node -p "JSON.stringify(require('./package.json').files || [])")
    if [[ "$files" == "[]" ]]; then
        log_warn "No 'files' field specified - entire package will be published"
    fi

    log_success "package.json validation passed"
}

# Clean and install dependencies
prepare_dependencies() {
    log_info "Preparing dependencies..."

    cd "$PROJECT_ROOT"

    # Clean node_modules and reinstall
    if [[ -d "node_modules" ]]; then
        log_info "Removing existing node_modules..."
        rm -rf node_modules
    fi

    log_info "Installing dependencies with npm ci..."
    npm ci

    log_success "Dependencies installed"
}

# Run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_warn "Skipping tests (--skip-tests flag set)"
        return 0
    fi

    log_info "Running tests..."

    cd "$PROJECT_ROOT"

    # Run format check
    log_info "Running format check..."
    npm run format:check || {
        log_error "Format check failed. Run 'npm run format' to fix."
        exit 1
    }

    # Run full test suite
    log_info "Running test suite..."
    npm test || {
        log_error "Tests failed"
        exit 1
    }

    log_success "All tests passed"
}

# Build the package
build_package() {
    log_info "Building package..."

    cd "$PROJECT_ROOT"

    # Clean dist directory
    if [[ -d "dist" ]]; then
        log_info "Cleaning dist directory..."
        rm -rf dist
    fi

    # Run build
    npm run build

    # Verify dist exists
    if [[ ! -d "dist" ]]; then
        log_error "Build failed - dist directory not created"
        exit 1
    fi

    # Verify main entry point exists
    local main_file="dist/cli.js"
    if [[ ! -f "$main_file" ]]; then
        log_error "Build failed - main entry point ($main_file) not found"
        exit 1
    fi

    log_success "Build completed successfully"
}

# Show package contents
preview_package() {
    log_info "Package preview..."

    cd "$PROJECT_ROOT"

    echo ""
    echo "Files to be published:"
    echo "======================"
    npm pack --dry-run 2>&1 | grep -E '^\s+' || true
    echo ""

    local tarball_size
    tarball_size=$(npm pack --dry-run 2>&1 | grep -oE 'total files:\s+[0-9]+' || echo "unknown")
    log_info "Package stats: $tarball_size"
}

# Confirm publish
confirm_publish() {
    if [[ "$FORCE" == "true" ]]; then
        log_warn "Skipping confirmation (--force flag set)"
        return 0
    fi

    local version
    version=$(node -p "require('./package.json').version")

    echo ""
    echo "=============================================="
    echo "  READY TO PUBLISH"
    echo "=============================================="
    echo "  Package: $PACKAGE_NAME"
    echo "  Version: $version"
    echo "  Registry: https://registry.npmjs.org/"
    echo "=============================================="
    echo ""

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN - Package will NOT be published"
        return 0
    fi

    read -p "Are you sure you want to publish? (type 'yes' to confirm): " confirm
    if [[ "$confirm" != "yes" ]]; then
        log_info "Publish cancelled"
        exit 0
    fi
}

# Publish to npm
publish_package() {
    cd "$PROJECT_ROOT"

    local version
    version=$(node -p "require('./package.json').version")

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would publish $PACKAGE_NAME@$version"
        npm publish --dry-run --access public
        log_success "Dry run completed"
        return 0
    fi

    log_info "Publishing to npm..."

    # Publish with public access (required for scoped packages)
    npm publish --access public

    log_success "Package published successfully!"

    # Create git tag
    log_info "Creating git tag cli-v$version..."
    git tag -a "cli-v$version" -m "Release cli-v$version"

    # Push tag to remote
    log_info "Pushing tag to remote..."
    git push origin "cli-v$version"

    log_success "Git tag cli-v$version created and pushed"
}

# Post-publish verification
verify_publish() {
    if [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi

    log_info "Verifying publication..."

    cd "$PROJECT_ROOT"

    local version
    version=$(node -p "require('./package.json').version")
    local name
    name=$(node -p "require('./package.json').name")

    # Wait a moment for npm to propagate
    sleep 5

    # Verify package is available
    if npm view "${name}@${version}" version >/dev/null 2>&1; then
        log_success "Verified: ${name}@${version} is available on npm"
    else
        log_warn "Could not verify publication - may take a few minutes to propagate"
    fi

    echo ""
    echo "=============================================="
    echo "  PUBLISH COMPLETE"
    echo "=============================================="
    echo "  Package: $name@$version"
    echo "  npm: https://www.npmjs.com/package/$name"
    echo "  Install: npm install $name@$version"
    echo "=============================================="
}

# Main execution
main() {
    echo ""
    echo "=============================================="
    echo "  NPM Package Publish Script"
    echo "  Package: $PACKAGE_NAME"
    echo "=============================================="
    echo ""

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Running in DRY RUN mode"
    fi

    check_prerequisites
    check_git_state
    check_package_json
    prepare_dependencies
    run_tests
    build_package
    preview_package
    confirm_publish
    publish_package
    verify_publish

    echo ""
    log_success "All done!"
}

# Run main
main "$@"
