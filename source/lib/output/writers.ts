/**
 * Output writers for CLI stream command
 */

import process from 'node:process';
import type {StreamOutput} from '../../types/output.js';

/**
 * Write output in JSON mode (NDJSON to stdout)
 */
export function writeJson(output: StreamOutput): void {
	process.stdout.write(JSON.stringify(output) + '\n');
}

/**
 * Check if stdout is a TTY (interactive terminal)
 */
export function checkIsTty(): boolean {
	return process.stdout.isTTY ?? false;
}
