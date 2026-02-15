/**
 * Example: Agent State Reducer
 *
 * Demonstrates the pure reducer pattern -- stepping through agent states
 * manually without a model. Shows how reduce() and nextAction() work.
 *
 * Run: npx tsx source/core/examples/05-reducer.ts
 */

import {
	type AgentConfig,
	type AgentEvent,
	type AgentState,
} from '../schemas.js';
import {initialState, reduce, nextAction} from '../agent.js';

function main() {
	const config: AgentConfig = {
		systemPrompt: 'You are a helpful assistant.',
		maxIterations: 5,
		maxErrors: 2,
	};

	// --- 1. Start with initial idle state ---
	let state: AgentState = initialState(config);
	console.log('Initial status:', state.status); // Idle
	console.log('Next action:', nextAction(state, config)); // { type: 'call_model' }

	// --- 2. User sends input ---
	const userEvent: AgentEvent = {
		type: 'user_input',
		message: {role: 'user', content: 'List the files'},
		timestamp: Date.now(),
	};
	state = reduce(state, userEvent);
	console.log('\nAfter user_input:', state.status); // Running
	console.log('Next action:', nextAction(state, config)); // { type: 'call_model' }

	// --- 3. Model responds with a tool call ---
	const modelEvent: AgentEvent = {
		type: 'model_response',
		result: {
			content: "I'll list the files for you.",
			toolCalls: [{id: 'tc_1', name: 'bash', args: {command: 'ls'}}],
		},
		timestamp: Date.now(),
	};
	state = reduce(state, modelEvent);
	console.log('\nAfter model_response:', state.status); // Running
	console.log('Iterations:', state.iterations); // 1
	console.log('Next action:', nextAction(state, config)); // { type: 'execute_tool', toolCall: ... }

	// --- 4. Tool call emitted ---
	const toolCallEvent: AgentEvent = {
		type: 'tool_call',
		toolCall: {id: 'tc_1', name: 'bash', args: {command: 'ls'}},
		timestamp: Date.now(),
	};
	state = reduce(state, toolCallEvent);

	// --- 5. Tool result comes back ---
	const toolResultEvent: AgentEvent = {
		type: 'tool_result',
		result: {toolCallId: 'tc_1', content: 'file1.ts\nfile2.ts'},
		timestamp: Date.now(),
	};
	state = reduce(state, toolResultEvent);
	console.log('\nAfter tool_result:', state.status); // Running
	console.log('Next action:', nextAction(state, config)); // { type: 'call_model' }

	// --- 6. Model responds with final answer (done) ---
	const doneModelEvent: AgentEvent = {
		type: 'model_response',
		result: {content: 'The directory has file1.ts and file2.ts.', done: true},
		timestamp: Date.now(),
	};
	state = reduce(state, doneModelEvent);
	console.log('\nAfter done model_response:', state.status); // Running
	console.log('Iterations:', state.iterations); // 2
	console.log('Next action:', nextAction(state, config)); // { type: 'done', reason: 'Model signaled done' }

	// --- 7. Done event finalizes state ---
	const doneEvent: AgentEvent = {
		type: 'done',
		reason: 'Model signaled done',
		timestamp: Date.now(),
	};
	state = reduce(state, doneEvent);
	console.log('\nFinal status:', state.status); // Done
	console.log('Total events:', state.events.length); // 6
	console.log('Next action:', nextAction(state, config)); // { type: 'done' }

	// --- 8. Demonstrate error limits ---
	console.log('\n--- Error limit demo ---');
	let errorState = initialState(config);
	errorState = reduce(errorState, userEvent);

	for (let i = 1; i <= 3; i++) {
		const errorEvent: AgentEvent = {
			type: 'error',
			error: {
				message: `Error attempt ${i}`,
				attempt: i,
				maxAttempts: 3,
				recoverable: i < 3,
				timestamp: Date.now(),
			},
			timestamp: Date.now(),
		};
		errorState = reduce(errorState, errorEvent);
		const action = nextAction(errorState, config);
		console.log(
			`Error ${i}: status=${errorState.status}, errorCount=${errorState.errorCount}, nextAction=${action.type}`,
		);
	}
}

main();
