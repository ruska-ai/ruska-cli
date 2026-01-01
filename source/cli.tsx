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

const cli = meow(
	`
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
	  $ ruska assistant abc-123                       # Get assistant details
	  $ ruska chat "Hello" -a <assistant-id>         # New conversation with assistant
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
		},
	},
);

const [command, ...args] = cli.input;

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

		case 'assistants': {
			await runAssistantsCommand();
			break;
		}

		case 'assistant': {
			const assistantId = args[0];
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
			const message = args.join(' ') || cli.flags.message;

			// Require either assistant or thread
			if (!assistantId && !threadId) {
				console.error('Usage: ruska chat "<message>" -a <assistant-id>');
				console.error('       ruska chat "<message>" -t <thread-id>');
				console.log('');
				console.log('Options:');
				console.log('  -a, --assistant   Assistant ID for new conversations');
				console.log('  -t, --thread      Thread ID to continue a conversation');
				console.log('');
				console.log('Examples:');
				console.log('  ruska chat "Hello" -a abc-123');
				console.log('  ruska chat "Follow up" -t thread-456');
				process.exit(1);
			}

			if (!message) {
				console.error('Error: Message is required');
				console.error('Usage: ruska chat "<message>" -a <assistant-id>');
				process.exit(1);
			}

			await runChatCommand(message, {
				json: cli.flags.json,
				assistantId,
				threadId,
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
