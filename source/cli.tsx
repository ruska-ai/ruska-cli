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

const cli = meow(
	`
	Usage
	  $ ruska <command> [options]

	Commands
	  auth              Configure API authentication
	  assistants        List your assistants
	  assistant <id>    Get assistant by ID
	  create            Create a new assistant
	  models            List available models

	Options
	  --ui              Launch interactive TUI mode

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
	  $ ruska --ui                                    # Launch TUI mode
`,
	{
		importMeta: import.meta,
		flags: {
			ui: {
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
