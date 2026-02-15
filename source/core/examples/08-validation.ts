/**
 * Example: Runtime Validation with Zod Schemas
 *
 * Demonstrates strict validation (throws), safe validation (returns result),
 * and working with discriminated union events.
 *
 * Run: npx tsx source/core/examples/08-validation.ts
 */

import {
	validateToolCall,
	safeValidateToolCall,
	validateAgentEvent,
	safeValidateAgentEvent,
	validateAgentConfig,
} from '../schemas.js';

function main() {
	// --- 1. Strict validation (throws on invalid data) ---
	console.log('--- Strict validation ---');
	const toolCall = validateToolCall({
		id: 'tc_1',
		name: 'bash',
		args: {command: 'ls -la'},
	});
	console.log('Valid tool call:', toolCall);

	try {
		validateToolCall({id: 123, name: 'bash'}); // id should be string, args missing
	} catch (error) {
		console.log('Validation error:', (error as Error).message.slice(0, 100));
	}

	// --- 2. Safe validation (never throws) ---
	console.log('\n--- Safe validation ---');
	const good = safeValidateToolCall({
		id: 'tc_2',
		name: 'get_weather',
		args: {city: 'Austin'},
	});
	console.log('Good result success:', good.success);
	if (good.success) {
		console.log('Parsed data:', good.data);
	}

	const bad = safeValidateToolCall({name: 42});
	console.log('Bad result success:', bad.success);
	if (!bad.success) {
		console.log('Error count:', bad.error.issues.length);
	}

	// --- 3. Discriminated union events ---
	console.log('\n--- Discriminated union events ---');
	const userInput = validateAgentEvent({
		type: 'user_input',
		message: {role: 'user', content: 'Hello'},
		timestamp: Date.now(),
	});
	console.log('Event type:', userInput.type);

	const modelResponse = validateAgentEvent({
		type: 'model_response',
		result: {content: 'Hi there!', done: true},
		timestamp: Date.now(),
	});
	console.log('Event type:', modelResponse.type);

	// Invalid event type is rejected
	const invalidEvent = safeValidateAgentEvent({
		type: 'unknown_type',
		data: 'foo',
	});
	console.log('Invalid event accepted?', invalidEvent.success); // false

	// --- 4. Config validation ---
	console.log('\n--- Config validation ---');
	const config = validateAgentConfig({
		systemPrompt: 'You are helpful.',
		maxIterations: 10,
		maxErrors: 3,
	});
	console.log('Config:', config);

	try {
		validateAgentConfig({
			systemPrompt: 'Hello',
			maxIterations: -1, // Must be positive
			maxErrors: 3,
		});
	} catch (error) {
		console.log('Config error:', (error as Error).message.slice(0, 80));
	}
}

main();
