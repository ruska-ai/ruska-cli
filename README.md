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
    create            Create a new assistant
    models            List available models
    chat              Chat with an AI assistant

  Options
    --ui              Launch interactive TUI mode

  Chat Options
    --assistant, -a   Assistant ID to chat with
    --message, -m     Message to send (non-interactive mode)
    --model           Model override (e.g., openai:gpt-4o)

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
    $ ruska create --name "My Agent" --model openai:gpt-4.1-mini
    $ ruska create -i                               # Interactive create mode
    $ ruska models                                  # List available models
    $ ruska chat                                    # Interactive chat mode
    $ ruska chat -a <assistant-id>                  # Chat with specific assistant
    $ ruska chat -m "Hello, AI!"                    # Single message mode
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

### `ruska chat`

Chat with an AI assistant with real-time streaming responses. Supports both interactive and non-interactive modes.

**Interactive mode (default):**

```bash
$ ruska chat

Checking authentication...
You: What is the capital of France?
AI: The capital of France is Paris.
You: (type next message or press Esc to exit)
```

**With a specific assistant:**

```bash
$ ruska chat -a eed8d8b3-3dcd-4396-afba-...

Chatting with: Currency Agent (openai:gpt-4o)
You: Convert 100 USD to EUR
AI: 100 USD is approximately 92.50 EUR at the current exchange rate.
```

**Non-interactive mode (single message):**

```bash
$ ruska chat -m "What is 2 + 2?"

AI: 2 + 2 equals 4.
```

**With model override:**

```bash
$ ruska chat --model openai:gpt-4o -m "Explain quantum computing"
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
