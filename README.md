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
    auth         Configure API authentication
    assistants   List your assistants

  Options
    --ui         Launch interactive TUI mode

  Examples
    $ ruska auth          # Configure API key and host
    $ ruska assistants    # List your assistants
    $ ruska --ui          # Launch TUI mode
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
 1. Currency Agent (gpt-4o)
 2. Research Assistant (claude-3-5-sonnet)

Found 2 assistants
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
