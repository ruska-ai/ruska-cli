/**
 * Example: Middleware System
 *
 * Demonstrates composable middleware hooks for logging, context injection,
 * tool gating, and error handling.
 *
 * Run: npx tsx source/core/examples/04-middleware.ts
 */

import {
	type AgentEvent,
	type AgentState,
	type CoreMessage,
} from '../schemas.js';
import {createMiddlewareStack, type Middleware} from '../middleware.js';

async function main() {
	// --- 1. Create a middleware stack ---
	const stack = createMiddlewareStack();

	// --- 2. Logger middleware (observes all events) ---
	const logger: Middleware = {
		name: 'logger',
		onEvent(event: AgentEvent, state: AgentState) {
			console.log(
				`[LOG] Event: ${event.type} | iterations=${state.iterations}`,
			);
		},
		onError(error, _state) {
			console.log(
				`[LOG] Error: ${error.message} (attempt ${error.attempt}/${error.maxAttempts})`,
			);
		},
	};
	stack.use(logger);

	// --- 3. Context injector (adds RAG results before model call) ---
	const ragInjector: Middleware = {
		name: 'rag-injector',
		beforeModel(messages: CoreMessage[], _state: AgentState): CoreMessage[] {
			const ragContext: CoreMessage = {
				role: 'user',
				content:
					'[Retrieved context]: The project uses TypeScript with ESM modules.',
			};
			return [...messages, ragContext];
		},
	};
	stack.use(ragInjector);

	// --- 4. Tool gating middleware (blocks dangerous commands) ---
	const safetyGate: Middleware = {
		name: 'safety-gate',
		beforeToolExecution(toolCall, _state) {
			if (toolCall.name === 'bash') {
				const command = String(toolCall.args['command'] ?? '');
				if (command.includes('rm -rf')) {
					console.log(`[SAFETY] Blocked dangerous command: ${command}`);
					return false; // Skip execution
				}
			}

			return true; // Allow execution
		},
	};
	stack.use(safetyGate);

	// --- Demo: Run the hooks ---
	const mockState: AgentState = {
		status: 'running',
		events: [],
		iterations: 3,
		errorCount: 0,
	};

	// Simulate onEvent
	console.log('--- onEvent ---');
	await stack.runOnEvent(
		{
			type: 'user_input',
			message: {role: 'user', content: 'hello'},
			timestamp: Date.now(),
		},
		mockState,
	);

	// Simulate beforeModel (RAG injection)
	console.log('\n--- beforeModel ---');
	const originalMessages: CoreMessage[] = [
		{role: 'system', content: 'You are helpful.'},
		{role: 'user', content: 'What stack does this project use?'},
	];
	const enrichedMessages = await stack.runBeforeModel(
		originalMessages,
		mockState,
	);
	console.log('Messages before:', originalMessages.length);
	console.log('Messages after:', enrichedMessages.length);
	console.log(
		'Injected:',
		enrichedMessages[enrichedMessages.length - 1]!.content.slice(0, 60),
	);

	// Simulate beforeToolExecution (safe command)
	console.log('\n--- beforeToolExecution (safe) ---');
	const allowed = await stack.runBeforeToolExecution(
		{id: 'tc_1', name: 'bash', args: {command: 'ls -la'}},
		mockState,
	);
	console.log('Allowed:', allowed); // True

	// Simulate beforeToolExecution (dangerous command)
	console.log('\n--- beforeToolExecution (blocked) ---');
	const blocked = await stack.runBeforeToolExecution(
		{id: 'tc_2', name: 'bash', args: {command: 'rm -rf /'}},
		mockState,
	);
	console.log('Allowed:', blocked); // False

	// Simulate onError
	console.log('\n--- onError ---');
	await stack.runOnError(
		{
			message: 'API rate limit exceeded',
			attempt: 2,
			maxAttempts: 3,
			recoverable: true,
			timestamp: Date.now(),
		},
		mockState,
	);
}

try {
	await main();
} catch (error: unknown) {
	console.error(error);
}
