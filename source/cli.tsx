#!/usr/bin/env node
import process from 'node:process';
import React from 'react';
import meow from 'meow';
import {withFullScreen} from 'fullscreen-ink';
import App from './app.js';
import {runAuthCommand} from './commands/auth.js';
import {runAssistantsCommand} from './commands/assistants.js';
import {runAssistantCommand} from './commands/assistant.js';
import {runModelsCommand} from './commands/models.js';
import {runCreateAssistantCommand} from './commands/create-assistant.js';
import {runChatCommand} from './commands/chat.js';
import {runVersionCommand} from './commands/version.js';
import {runHealthCommand} from './commands/health.js';
import {runUserCommand} from './commands/user.js';

const cli = meow(
	`
	Usage
	  $ ruska <command> [options]

	Commands
	  auth              Configure API authentication
	  user              Show current user info
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
	  --model           Model to use (default: your configured default model)
	  --tools           Tools to enable (default: web_search,web_scrape,math_calculator,think_tool,python_sandbox)
	                    Use --tools=disabled to disable all tools
	                    Use --tools=tool1,tool2 for specific tools
	  --json            Output as newline-delimited JSON (auto-enabled when piped)
	  --truncate <n>    Max characters for tool output (default: 500)
	  --truncate-lines  Max lines for tool output (default: 10)
	  --full-output     Disable truncation (show full output)
	  --bash            Enable local bash command execution (SECURITY: commands run on YOUR machine)
	  --auto-approve    DANGEROUS: Auto-approve bash commands without confirmation
	  --bash-timeout    Timeout for bash commands in ms (default: 30000)

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
	  $ ruska chat "Hello"                           # Chat with default tools enabled
	  $ ruska chat "Hello" --tools=disabled          # Chat without any tools
	  $ ruska chat "Search X" --tools=web_search     # Chat with specific tools
	  $ ruska chat "Hello" -a <assistant-id>         # Chat with specific assistant
	  $ ruska chat "Follow up" -t <thread-id>        # Continue existing thread
	  $ ruska chat "Hello" -a <id> --json            # Output as NDJSON
	  $ ruska chat "Query" -a <id> | jq '.type'      # Pipe to jq
	  $ ruska create --name "My Agent" --model openai:gpt-4.1-mini
	  $ ruska create -i                               # Interactive create mode
	  $ ruska models                                  # List available models
	  $ ruska --ui                                    # Launch TUI mode
`,
	{
		importMeta: import.meta,
		flags: {
			ui: {
				type: 'boolean',
				default: false,
			},
			json: {
				type: 'boolean',
				default: false,
			},
			assistant: {
				type: 'string',
				shortFlag: 'a',
			},
			message: {
				type: 'string',
				shortFlag: 'm',
			},
			thread: {
				type: 'string',
				shortFlag: 't',
			},
			truncate: {
				type: 'number',
				default: 500,
			},
			truncateLines: {
				type: 'number',
				default: 10,
			},
			fullOutput: {
				type: 'boolean',
				default: false,
			},
			interactive: {
				type: 'boolean',
				shortFlag: 'i',
				default: false,
			},
			name: {
				type: 'string',
			},
			model: {
				type: 'string',
			},
			description: {
				type: 'string',
			},
			systemPrompt: {
				type: 'string',
			},
			tools: {
				type: 'string',
			},
			bash: {
				type: 'boolean',
				default: false,
			},
			autoApprove: {
				type: 'boolean',
				default: false,
			},
			bashTimeout: {
				type: 'number',
				default: 30_000,
			},
		},
	},
);

const [command, ...arguments_] = cli.input;

// Route to appropriate command
async function main() {
	if (cli.flags.ui) {
		// TUI Mode - launch fullscreen interface
		await withFullScreen(<App />).start();
		return;
	}

	switch (command) {
		case 'auth': {
			await runAuthCommand();
			break;
		}

		case 'user':
		case 'whoami': {
			await runUserCommand();
			break;
		}

		case 'assistants': {
			await runAssistantsCommand();
			break;
		}

		case 'assistant': {
			const assistantId = arguments_[0];
			if (!assistantId) {
				console.error('Usage: ruska assistant <id>');
				console.log('Run `ruska assistants` to list available assistants');
				process.exit(1);
			}

			await runAssistantCommand(assistantId);
			break;
		}

		case 'models': {
			await runModelsCommand();
			break;
		}

		case 'chat': {
			// Check both short and long flags (meow stores them separately)
			const assistantId =
				cli.flags.assistant ??
				(cli.flags as Record<string, unknown>)['a']?.toString();
			const threadId =
				cli.flags.thread ??
				(cli.flags as Record<string, unknown>)['t']?.toString();
			const message = arguments_.join(' ') || cli.flags.message;

			if (!message) {
				console.error('Error: Message is required');
				console.error('Usage: ruska chat "<message>" [-a <assistant-id>]');
				process.exit(1);
			}

			await runChatCommand(message, {
				json: cli.flags.json,
				model: cli.flags.model,
				assistantId,
				threadId,
				tools: cli.flags.tools,
				truncateOptions: cli.flags.fullOutput
					? undefined
					: {
							maxLength: cli.flags.truncate,
							maxLines: cli.flags.truncateLines,
					  },
				enableBash: cli.flags.bash,
				autoApprove: cli.flags.autoApprove,
				bashTimeout: cli.flags.bashTimeout,
			});
			break;
		}

		case 'create': {
			// Check both -i and --interactive flags
			const isInteractive =
				cli.flags.interactive ||
				(cli.flags as Record<string, unknown>)['i'] === true;
			await runCreateAssistantCommand({
				interactive: isInteractive,
				name: cli.flags.name,
				model: cli.flags.model,
				description: cli.flags.description,
				systemPrompt: cli.flags.systemPrompt,
				tools: cli.flags.tools,
			});
			break;
		}

		case 'version': {
			await runVersionCommand();
			break;
		}

		case 'health': {
			await runHealthCommand();
			break;
		}

		case 'help':
		case undefined: {
			cli.showHelp();
			break;
		}

		default: {
			console.error(`Unknown command: ${command}`);
			console.log('Run `ruska --help` for available commands');
			process.exit(1);
		}
	}
}

await main();
