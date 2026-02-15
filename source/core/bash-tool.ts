/**
 * Bash tool for the core tool registry.
 * Delegates to the existing lib/local-tools/ infrastructure.
 */

import {executeBash, formatResultForLlm} from '../lib/local-tools/bash-executor.js';
import {type ToolDefinition} from './schemas.js';
import {type ToolExecutor, type ToolRegistry} from './tool.js';

/**
 * Tool definition for the bash tool.
 */
export const bashToolDefinition: ToolDefinition = {
	name: 'bash',
	description: 'Execute a bash command locally with safety controls',
	parameters: {
		command: {type: 'string', description: 'The bash command to execute', required: true},
		cwd: {type: 'string', description: 'Working directory for command execution'},
		timeout: {type: 'number', description: 'Timeout in milliseconds'},
	},
};

/**
 * Creates a bash executor that wraps the existing executeBash infrastructure.
 */
export function createBashExecutor(): ToolExecutor {
	return async (args: Record<string, unknown>): Promise<string> => {
		const command = String(args['command'] ?? '');
		const cwd = args['cwd'] === undefined ? undefined : String(args['cwd']);
		const timeout = args['timeout'] === undefined ? undefined : Number(args['timeout']);

		const result = await executeBash({command, cwd, timeout});
		return formatResultForLlm(result);
	};
}

/**
 * Convenience: registers the bash tool in a registry in one call.
 */
export function registerBashTool(registry: ToolRegistry): void {
	registry.register(bashToolDefinition, createBashExecutor());
}
