/**
 * Example: Full Agent Loop with Mock Model
 *
 * Demonstrates runAgent() end-to-end using a mock model that simulates
 * an LLM calling a tool and then producing a final answer.
 *
 * Run: npx tsx source/core/examples/06-agent-loop.ts
 */

import {type CoreMessage, type ModelResult, type ToolDefinition} from '../schemas.js';
import {type ModelInterface} from '../model.js';
import {createToolRegistry, defineTool} from '../tool.js';
import {createMiddlewareStack, type Middleware} from '../middleware.js';
import {runAgent} from '../agent.js';

/**
 * A mock model that simulates two turns:
 * 1. First call: returns a tool call to get_time
 * 2. Second call: returns a final answer using the tool result
 */
function createMockModel(): ModelInterface {
	let callCount = 0;

	return {
		async invoke(
			messages: CoreMessage[],
			_tools?: ToolDefinition[],
		): Promise<ModelResult> {
			callCount++;

			if (callCount === 1) {
				// First turn: call the get_time tool
				return {
					content: 'Let me check the time for you.',
					toolCalls: [
						{id: 'tc_1', name: 'get_time', args: {timezone: 'UTC'}},
					],
				};
			}

			// Second turn: produce final answer using tool result from context
			const lastMessage = messages[messages.length - 1];
			const timeResult = lastMessage?.content ?? 'unknown';

			return {
				content: `The current time is ${timeResult}. Is there anything else I can help with?`,
				done: true,
			};
		},
	};
}

async function main() {
	// --- 1. Set up tool registry with a simple tool ---
	const registry = createToolRegistry();

	registry.register(
		defineTool('get_time', 'Get the current time in a timezone', {
			timezone: {type: 'string', description: 'IANA timezone', required: true},
		}),
		async (args) => {
			const tz = String(args['timezone'] ?? 'UTC');
			return new Date().toLocaleString('en-US', {timeZone: tz});
		},
	);

	// --- 2. Set up middleware for observability ---
	const middleware = createMiddlewareStack();

	const logger: Middleware = {
		name: 'event-logger',
		onEvent(event, state) {
			const detail
				= event.type === 'model_response'
					? event.result.content.slice(0, 50)
					: event.type === 'tool_result'
						? event.result.content.slice(0, 50)
						: '';
			console.log(
				`  [${event.type}] iter=${state.iterations} errors=${state.errorCount}${detail ? ` | ${detail}` : ''}`,
			);
		},
	};
	middleware.use(logger);

	// --- 3. Run the agent ---
	console.log('Starting agent loop...\n');

	const finalState = await runAgent({
		input: 'What time is it in UTC?',
		model: createMockModel(),
		toolRegistry: registry,
		config: {
			systemPrompt: 'You are a helpful time assistant.',
			maxIterations: 5,
			maxErrors: 2,
		},
		middleware,
	});

	// --- 4. Inspect final state ---
	console.log('\n--- Final State ---');
	console.log('Status:', finalState.status);
	console.log('Iterations:', finalState.iterations);
	console.log('Total events:', finalState.events.length);
	console.log('Event types:', finalState.events.map(e => e.type).join(' -> '));

	// Extract the final assistant message
	const lastModelResponse = [...finalState.events]
		.reverse()
		.find(e => e.type === 'model_response');

	if (lastModelResponse?.type === 'model_response') {
		console.log('\nFinal answer:', lastModelResponse.result.content);
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((error: unknown) => {
	console.error(error);
});
