/**
 * Default tools and parsing for chat command
 * @see frontend/src/components/menus/BaseToolMenu.tsx for frontend equivalent
 */

/**
 * Default tools enabled for chat command
 * Mirrors frontend DEFAULT_AGENT_TOOLS in BaseToolMenu.tsx
 */
export const defaultAgentTools = [
	'web_search',
	'web_scrape',
	'math_calculator',
	'think_tool',
	'python_sandbox',
] as const;

export type DefaultAgentTool = (typeof defaultAgentTools)[number];

/**
 * Local tools that execute on the CLI side, not the backend
 * These tools are intercepted before reaching the server
 */
export const localTools = ['bash_tool'] as const;

export type LocalTool = (typeof localTools)[number];

/**
 * Type guard to check if a tool name is a local tool
 */
export function isLocalTool(name: string): name is LocalTool {
	return (localTools as readonly string[]).includes(name);
}

/**
 * Parse --tools flag value into array of tool names
 *
 * @param value - Raw flag value (undefined, 'disabled', or comma-separated)
 * @returns Array of tool names to send to API
 *
 * @example
 * parseToolsFlag(undefined)             // returns DEFAULT_AGENT_TOOLS
 * parseToolsFlag('')                    // returns DEFAULT_AGENT_TOOLS
 * parseToolsFlag('disabled')            // returns []
 * parseToolsFlag('web_search,think_tool') // returns ['web_search', 'think_tool']
 */
export function parseToolsFlag(value: string | undefined): string[] {
	// No flag or empty string: use defaults
	if (value === undefined || value.trim() === '') {
		return [...defaultAgentTools];
	}

	// Explicit disable
	if (value.toLowerCase() === 'disabled') {
		return [];
	}

	// Parse comma-separated list
	return value
		.split(',')
		.map(t => t.trim())
		.filter(Boolean);
}

/**
 * Build tools array for stream request
 * Optionally includes bash_tool if enabled
 *
 * @param enableBash - Whether to include bash_tool
 * @param baseTools - Base tools array (defaults to parseToolsFlag result)
 * @returns Array of tool names including bash_tool if enabled
 */
export function buildToolsArray(
	enableBash: boolean,
	baseTools?: string[],
): string[] {
	const tools = baseTools ?? [...defaultAgentTools];

	if (enableBash && !tools.includes('bash_tool')) {
		return [...tools, 'bash_tool'];
	}

	return tools;
}
