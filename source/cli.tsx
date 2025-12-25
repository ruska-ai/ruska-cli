#!/usr/bin/env node
import React from 'react';
import meow from 'meow';
import {withFullScreen} from 'fullscreen-ink';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ shell [options]

	Options
	  --ui  Launch interactive TUI mode

	Examples
	  $ shell          # Run in CLI mode (default)
	  $ shell --ui     # Launch TUI mode
`,
	{
		importMeta: import.meta,
		flags: {
			ui: {
				type: 'boolean',
				default: false,
			},
		},
	},
);

if (cli.flags.ui) {
	// TUI Mode - launch fullscreen interface
	await withFullScreen(<App />).start();
} else {
	// CLI Mode (default)
	console.log('Shell CLI - Use --ui to launch interactive TUI');
	console.log('Run `shell --help` for more options');
}
