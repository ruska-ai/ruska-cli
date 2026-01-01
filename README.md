# Ruska CLI

Command-line interface for Orchestra - AI Agent Orchestration Platform.

## Install

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
    chat <message>    Chat with an assistant or continue a thread
    create            Create a new assistant
    models            List available models

  Options
    --ui              Launch interactive TUI mode

  Chat Options
    -a, --assistant   Assistant ID for new conversations
    -t, --thread      Thread ID to continue a conversation
    -m, --message     Message (alternative to positional arg)
    --json            Output as newline-delimited JSON (auto-enabled when piped)

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
    $ ruska assistant eed8d8b3-3dcd-4396-afba-...   # Get assistant details
    $ ruska chat "Hello" -a <assistant-id>         # New conversation with assistant
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

Chat with an assistant or continue a thread using streaming. Requires authentication.

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

| Option            | Description                                      |
| ----------------- | ------------------------------------------------ |
| `-a, --assistant` | Assistant ID for new conversations               |
| `-t, --thread`    | Thread ID to continue an existing conversation   |
| `-m, --message`   | Message to send (alternative to positional arg)  |
| `--json`          | Output as newline-delimited JSON (NDJSON)        |

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

## Configuration

Config is stored at `~/.ruska/auth.json`:

```json
{
	"apiKey": "enso_...",
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
