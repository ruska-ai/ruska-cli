/**
 * Example: Thread (Event Log) & Context Builder
 *
 * Demonstrates the append-only event log, event filtering,
 * serialization/deserialization, and building a model context window.
 *
 * Run: npx tsx source/core/examples/03-thread-and-context.ts
 */

import {type AgentEvent} from '../schemas.js';
import {createThread, deserializeThread} from '../thread.js';
import {buildContext, estimateTokens} from '../context.js';

function main() {
	const now = Date.now();

	// --- 1. Create a thread and append events ---
	const thread = createThread();

	thread.append({
		type: 'user_input',
		message: {role: 'user', content: 'What files are in the current directory?'},
		timestamp: now,
	});

	thread.append({
		type: 'model_response',
		result: {
			content: 'Let me check that for you.',
			toolCalls: [{id: 'tc_1', name: 'bash', args: {command: 'ls -la'}}],
		},
		timestamp: now + 1000,
	});

	thread.append({
		type: 'tool_call',
		toolCall: {id: 'tc_1', name: 'bash', args: {command: 'ls -la'}},
		timestamp: now + 2000,
	});

	thread.append({
		type: 'tool_result',
		result: {toolCallId: 'tc_1', content: 'file1.ts\nfile2.ts\nREADME.md'},
		timestamp: now + 3000,
	});

	thread.append({
		type: 'model_response',
		result: {content: 'The directory contains: file1.ts, file2.ts, and README.md', done: true},
		timestamp: now + 4000,
	});

	console.log('Thread length:', thread.length); // 5

	// --- 2. Filter events by type ---
	const modelResponses = thread.eventsOfType('model_response');
	console.log('Model responses:', modelResponses.length); // 2

	const errors = thread.eventsOfType('error');
	console.log('Errors:', errors.length); // 0

	// --- 3. Serialize and deserialize (pause/resume) ---
	const json = thread.serialize();
	console.log('Serialized length:', json.length, 'chars');

	const restored = deserializeThread(json);
	console.log('Restored thread length:', restored.length); // 5

	// --- 4. Build context for model consumption ---
	const events: AgentEvent[] = thread.events();

	const context = buildContext(events, {
		systemPrompt: 'You are a helpful file system assistant.',
	});

	console.log('\n--- Context Messages ---');
	for (const msg of context) {
		console.log(`[${msg.role}] ${msg.content.slice(0, 80)}${msg.content.length > 80 ? '...' : ''}`);
	}

	// --- 5. Context with windowing (keep last 3 messages) ---
	const windowed = buildContext(events, {
		systemPrompt: 'You are a helpful assistant.',
		maxMessages: 3,
	});

	console.log('\n--- Windowed Context (max 3 + system) ---');
	console.log('Message count:', windowed.length);
	// system + last 3 non-system messages

	// --- 6. Token estimation ---
	const tokens = estimateTokens(context);
	console.log('\nEstimated tokens:', tokens);
}

main();
