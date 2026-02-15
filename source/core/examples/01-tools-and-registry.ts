/**
 * Example: Tool Registry & Custom Tools
 *
 * Demonstrates creating a tool registry, defining custom tools,
 * executing tool calls, and handling errors.
 *
 * Run: npx tsx source/core/examples/01-tools-and-registry.ts
 */

import {createToolRegistry, defineTool} from '../tool.js';
import {registerBashTool} from '../bash-tool.js';

async function main() {
	// --- 1. Create a registry and register the built-in bash tool ---
	const registry = createToolRegistry();
	registerBashTool(registry);

	console.log('Registered tools:', registry.definitions().map(d => d.name));
	// => ['bash']

	// --- 2. Define and register a custom tool ---
	const weatherTool = defineTool(
		'get_weather',
		'Get current weather for a city',
		{
			city: {type: 'string', description: 'City name', required: true},
			units: {type: 'string', description: 'celsius or fahrenheit'},
		},
	);

	registry.register(weatherTool, async (args) => {
		const city = String(args['city']);
		const units = String(args['units'] ?? 'celsius');
		return `Weather in ${city}: 22°${units === 'celsius' ? 'C' : 'F'}, partly cloudy`;
	});

	console.log('All tools:', registry.definitions().map(d => d.name));
	// => ['bash', 'get_weather']

	// --- 3. Execute a tool call (simulating what the LLM would produce) ---
	const result = await registry.execute({
		id: 'call_1',
		name: 'get_weather',
		args: {city: 'Austin', units: 'fahrenheit'},
	});

	console.log('Tool result:', result);
	// => { toolCallId: 'call_1', content: 'Weather in Austin: 22°F, partly cloudy' }

	// --- 4. Execute an unknown tool (error is captured, not thrown) ---
	const unknownResult = await registry.execute({
		id: 'call_2',
		name: 'nonexistent_tool',
		args: {},
	});

	console.log('Unknown tool result:', unknownResult);
	// => { toolCallId: 'call_2', content: 'Unknown tool: nonexistent_tool', isError: true }

	// --- 5. Tool executor that throws (error captured as ToolResult) ---
	registry.register(
		defineTool('flaky_tool', 'A tool that always fails', {}),
		async () => {
			throw new Error('Connection refused');
		},
	);

	const flakyResult = await registry.execute({
		id: 'call_3',
		name: 'flaky_tool',
		args: {},
	});

	console.log('Flaky tool result:', flakyResult);
	// => { toolCallId: 'call_3', content: 'Connection refused', isError: true }

	// --- 6. Check if a tool exists ---
	console.log('Has bash?', registry.has('bash')); // true
	console.log('Has foo?', registry.has('foo'));    // false
}

main().catch(console.error);
