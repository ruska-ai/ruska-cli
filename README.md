# Ruska CLI

Command-line interface for Orchestra - AI Agent Orchestration Platform.

## Install

```bash
# Install globally from npm
npm install -g @ruska/cli

# Or run directly with npx
npx @ruska/cli --help
```

### Development Setup

```bash
# From the cli directory
npm install
npm run build
npm link  # Makes 'ruska' available globally
```

## Usage

```
$ ruska --help

  CLI for Orchestra - AI Agent Orchestration Platform

  Usage
    $ ruska <command> [options]

  Commands
    auth              Configure API authentication
    assistants        List your assistants
    assistant <id>    Get assistant by ID
    chat <message>    Chat with the LLM (optionally with an assistant)
    create            Create a new assistant
    models            List available models
    version           Show CLI and API version
    health            Check API health status

  Options
    --ui              Launch interactive TUI mode

  Chat Options
    -a, --assistant   Assistant ID (optional, uses default chat if omitted)
    -t, --thread      Thread ID to continue a conversation
    -m, --message     Message (alternative to positional arg)
    --json            Output as newline-delimited JSON (auto-enabled when piped)
    --truncate <n>    Max characters for tool output (default: 500)
    --truncate-lines  Max lines for tool output (default: 10)
    --full-output     Disable truncation (show full output)

  Create Options
    --name            Assistant name (required)
    --model           Model to use (default: openai:gpt-4.1-mini)
    --description     Assistant description
    --system-prompt   System prompt for the assistant
    --tools           Comma-separated list of tools
    -i, --interactive Interactive mode for create command

  Examples
    $ ruska auth                                    # Configure API key and host
    $ ruska assistants                              # List your assistants
    $ ruska assistant abc-123                       # Get assistant details
    $ ruska chat "Hello"                           # Direct chat with default LLM
    $ ruska chat "Hello" -a <assistant-id>         # Chat with specific assistant
    $ ruska chat "Follow up" -t <thread-id>        # Continue existing thread
    $ ruska chat "Hello" -a <id> --json            # Output as NDJSON
    $ ruska chat "Query" -a <id> | jq '.type'      # Pipe to jq
    $ ruska create --name "My Agent" --model openai:gpt-4.1-mini
    $ ruska create -i                               # Interactive create mode
    $ ruska models                                  # List available models
    $ ruska --ui                                    # Launch TUI mode
```

## Authentication

Before using the CLI, you need to configure your API key:

```bash
$ ruska auth
```

This will prompt you to:

1. Select your Orchestra host (Production, Development, or Custom URL)
2. Enter your API key (get this from Settings in the Orchestra web app)

Your credentials are stored in `~/.ruska/auth.json`.

## Commands

### `ruska auth`

Configure API authentication. Interactive command that prompts for:

- Host selection (production/development/custom)
- API key input (masked for security)

The command validates your API key before saving.

### `ruska assistants`

List all your assistants. Requires authentication.

```bash
$ ruska assistants

Your Assistants
eed8d8b3-3dcd-4396-afba-... Currency Agent (openai:gpt-4o)
a1b2c3d4-5678-90ab-cdef-... Research Assistant (anthropic:claude-3-5-sonnet)

Found 2 assistants
```

### `ruska assistant <id>`

Get details for a specific assistant by ID. Requires authentication.

```bash
$ ruska assistant eed8d8b3-3dcd-4396-afba-...

Assistant Details
Last Update: 2024-01-15T10:30:00Z
ID: eed8d8b3-3dcd-4396-afba-...
Name: Currency Agent
Description: Converts currencies using real-time rates
Model: openai:gpt-4o
Tools: get_exchange_rate, convert_currency
```

### `ruska chat <message>`

Chat with the LLM (optionally with an assistant) using streaming. Requires authentication.

**Direct chat with default LLM:**

```bash
$ ruska chat "Hello, how are you?"
```

**Start a new conversation with an assistant:**

```bash
$ ruska chat "Hello, how are you?" -a e5120812-3bcc-4b1e-93fb-3c1264291dfe
```

**Continue an existing thread:**

```bash
$ ruska chat "Follow up question" -t <thread-id>
```

**JSON output mode (for scripting):**

```bash
$ ruska chat "Hello" -a <assistant-id> --json
{"type":"chunk","content":"Hello"}
{"type":"chunk","content":"!"}
{"type":"done","response":{"messages":[...]}}
```

JSON mode is auto-enabled when output is piped:

```bash
$ ruska chat "Hello" -a <assistant-id> | jq '.type'
```

**Options:**

| Option             | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `-a, --assistant`  | Assistant ID (optional, uses default chat if omitted) |
| `-t, --thread`     | Thread ID to continue an existing conversation        |
| `-m, --message`    | Message to send (alternative to positional arg)       |
| `--tools`          | Tools for the chat session (see below for modes)      |
| `--json`           | Output as newline-delimited JSON (NDJSON)             |
| `--truncate <n>`   | Max characters for tool output (default: 500)         |
| `--truncate-lines` | Max lines for tool output (default: 10)               |
| `--full-output`    | Disable truncation (show full output)                 |

**Tool options:**

| Value                 | Behavior                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- |
| (not provided)        | Uses default tools: web_search, web_scrape, math_calculator, think_tool, python_sandbox |
| `--tools=disabled`    | Disables all tools                                                                      |
| `--tools=tool1,tool2` | Uses only the specified tools                                                           |

**Examples with tools:**

```bash
# Chat with default tools (web search, scrape, calculator, think, python)
$ ruska chat "What's the weather in Dallas?"

# Chat without any tools
$ ruska chat "Tell me a joke" --tools=disabled

# Chat with specific tools only
$ ruska chat "Calculate 2+2" --tools=math_calculator
$ ruska chat "Search and analyze" --tools=web_search,think_tool
```

**Exit codes:**

| Code | Meaning               |
| ---- | --------------------- |
| 0    | Success               |
| 1    | Network error         |
| 2    | Authentication failed |
| 3    | Rate limited          |
| 4    | Timeout               |
| 5    | Server error          |

### `ruska create`

Create a new assistant. Can be used in non-interactive mode with flags or interactive mode with `-i`.

**Non-interactive mode (default):**

```bash
$ ruska create --name "My Agent" --model openai:gpt-4o --tools "web_search,calculator"

Assistant created successfully!
ID: abc12345-...
Name: My Agent
Model: openai:gpt-4o
```

**Interactive mode:**

```bash
$ ruska create -i

Create Assistant
Name: My Agent
Description: A helpful assistant
Model: openai:gpt-4o  # Use arrow keys to navigate, type to filter
System Prompt: You are a helpful assistant.
Tools: web_search, calculator

Assistant created successfully!
```

### `ruska models`

List available models. Does not require authentication but will use your API key if configured.

```bash
$ ruska models

Available Models (https://chat.ruska.ai)
Default: openai:gpt-4.1-mini

Free Models:
 - openai:gpt-4.1-mini
 - anthropic:claude-3-haiku

All Models (15):
 - openai:gpt-4o
 - openai:gpt-4.1-mini
 - anthropic:claude-3-5-sonnet
 ...
```

### `ruska version`

Show CLI and API version information.

```bash
$ ruska version

Ruska CLI v0.1.3
API: https://chat.ruska.ai
```

### `ruska health`

Check API health status.

```bash
$ ruska health

API Health Check
Status: healthy
```

### `ruska --ui`

Launch the interactive TUI (Terminal User Interface) mode with a full-screen interface.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests (linting + build + ava)
npm run test

# Format code
npm run format

# Run directly
node dist/cli.js --help
```

## Deployment

Publishing `@ruska/cli` to NPM.

### Automated (CI/CD)

Push a version tag to trigger the GitHub Actions workflow:

```bash
# 1. Bump version in package.json
./scripts/publish/version-bump.sh patch  # or minor, major, 1.2.3

# 2. Commit the version change
git add package.json
git commit -m "chore(cli): bump version to X.Y.Z"

# 3. Create and push tag (triggers CI publish)
git tag cli-vX.Y.Z
git push origin cli-vX.Y.Z
```

### Manual Publishing

Use the manual scripts when CI/CD fails or for testing:

```bash
# 1. Pre-flight safety checks (optional but recommended)
./scripts/publish/pre-publish-check.sh

# 2. Bump version
./scripts/publish/version-bump.sh patch

# 3. Verify build output
./scripts/publish/verify-build.sh

# 4. Publish to NPM (includes all checks)
./scripts/publish/publish.sh

# Or dry-run first:
./scripts/publish/publish.sh --dry-run
```

### Script Reference

| Script                 | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `version-bump.sh`      | Bump version (major/minor/patch or explicit) |
| `pre-publish-check.sh` | Safety checks (secrets, TODOs, semver)       |
| `verify-build.sh`      | Verify dist output is correct                |
| `publish.sh`           | Full publish with all validations            |
| `rollback.sh`          | Emergency: deprecate a bad version           |

### Rollback

If a published version has critical issues:

```bash
# Deprecate the problematic version
./scripts/publish/rollback.sh 1.2.3

# Or deprecate and recommend a specific version
./scripts/publish/rollback.sh 1.2.3 1.2.2
```

### Requirements

- Node.js 18+
- NPM authentication (`npm login`)
- 2FA enabled for npm writes (recommended)
- `NPM_TOKEN` secret configured for CI

## Roadmap

The 12-Factor Agent Core module (`source/core/`) implements agent primitives (schemas, agent loop, model interface, tool registry, bash tool, middleware, context builder, thread, prompt templates, error handling) based on [12-factor-agents](https://github.com/humanlayer/12-factor-agents) design principles. Integration into the CLI follows a dependency-ordered phased approach.

### Dependency Graph

```
P0: Barrel Export ─────┬──> P1A: Event Emitter Adapter ──┐
                       │                                  │
                       ├──> P1B: Bash Consent Middleware ──┼──> P2A: Agent Runner Factory ──┬──> P3A: TUI Integration
                       │                                  │                                │
                       └──> P1C: Thread Persistence ──────┘                                └──> P3B: JSON Mode Integration
```

- P1A, P1B, P1C are independent of each other (parallelizable)
- P2A requires all three Phase 1 items
- P3A and P3B require P2A and can be done in parallel

### Phase Summaries

**Phase 0 — Barrel Export** creates `source/core/index.ts`, re-exporting all public symbols from the core module so that consumers import from a single entry point instead of individual files. This is the zero-cost prerequisite for all integration work.

**Phase 1A — Event Emitter Adapter** adds `runAgentStream()` as an `AsyncGenerator<AgentEvent, AgentState>` to `source/core/agent.ts`, enabling the TUI to receive real-time events (model responses, tool calls, tool results) as they happen instead of waiting for the full loop to complete.

**Phase 1B — Bash Consent Middleware** creates `source/core/bash-consent-middleware.ts` with a framework-agnostic `createBashConsentMiddleware(handler)` factory that integrates bash command approval into the core middleware system, reusing existing `validateCommand()` and `assessCommandRisk()` from `source/lib/local-tools/security.ts`.

**Phase 1C — Thread Filesystem Persistence** creates `source/core/thread-store.ts` with a `ThreadStore` interface and `createFileThreadStore(dir)` factory so that the CLI's `-t <thread-id>` flag can load and continue previous conversations through the core module.

**Phase 2A — Agent Runner Factory** creates `source/core/runner.ts` with `createAgentRunner(config)` that wires model, tools, middleware, and thread together from CLI-level options into a single entry point for agent execution.

**Phase 3A — TUI Integration** rewrites `ChatCommandTui` in `source/commands/chat.tsx` to use the core runner, consolidating orchestration logic and eliminating ~150 lines of ad-hoc React-hook-based orchestration.

**Phase 3B — JSON Mode Integration** rewrites `runJsonMode()` in `source/commands/chat.tsx` to use the core runner, enabling bash tool execution in JSON/piped mode (previously impossible).

### Versioning

| Phase | Version | Tag | Rationale |
| --- | --- | --- | --- |
| P0 | **0.2.0** | `cli-v0.2.0` | New public API surface (barrel export). Additive, no breaking changes. |
| P1A+P1B+P1C | **0.3.0** | `cli-v0.3.0` | Streaming + consent + persistence primitives. All additive. |
| P2A | **0.4.0** | `cli-v0.4.0` | Agent runner factory. Core apparatus fully wired. |
| P3A+P3B | **0.5.0** | `cli-v0.5.0` | TUI and JSON mode use core. Behavioral parity, different internals. |

Stay in `0.x` until the barrel export API is stable and documented for external consumers.

## Configuration

Config is stored at `~/.ruska/auth.json`:

```json
{
	"apiKey": "otk_...",
	"host": "https://chat.ruska.ai"
}
```

## Examples

**Chat with Python Agent**

_Request:_

```bash
ruska chat "Provide first 20 of fib using python_sandbox" \
  -a e5120812-3bcc-4b1e-93fb-3c1264291dfe \
  --json \
| jq -r '.response.messages[-1].content'
```

_Response:_

```log
> Ledger Snapshot:
> Goal: Provide first 20 Fibonacci numbers using Python.
> Now: Completed Fibonacci sequence calculation.
> Next: None.
> Open Questions: None.

The first 20 Fibonacci numbers are:
0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181.
```
