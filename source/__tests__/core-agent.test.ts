/**
 * Tests for Agent Loop / Reducer.
 * Covers US-012: Implement Agent Loop / Reducer
 */

import test from 'ava';
import {
	type AgentConfig,
	type AgentState,
	type AgentEvent,
	type ModelResult,
	type ToolCall,
} from '../core/schemas.js';
import {createMiddlewareStack} from '../core/middleware.js';
import {createToolRegistry} from '../core/tool.js';
import {type ModelInterface} from '../core/model.js';
import {initialState, reduce, nextAction, runAgent} from '../core/agent.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
	return {
		systemPrompt: 'You are helpful.',
		maxIterations: 10,
		maxErrors: 3,
		...overrides,
	};
}

function makeState(overrides?: Partial<AgentState>): AgentState {
	return {
		status: 'idle',
		events: [],
		iterations: 0,
		errorCount: 0,
		...overrides,
	};
}

function makeModel(results: ModelResult[]): ModelInterface {
	let callIndex = 0;
	return {
		async invoke(): Promise<ModelResult> {
			if (callIndex >= results.length) {
				return {content: '', done: true};
			}

			const result = results[callIndex]!;
			callIndex++;
			return result;
		},
	};
}

function makeFailingModel(error: Error, afterN = 0): ModelInterface {
	let callCount = 0;
	return {
		async invoke(): Promise<ModelResult> {
			callCount++;
			if (callCount > afterN) {
				throw error;
			}

			return {content: 'ok', done: true};
		},
	};
}

// =============================================================================
// initialState
// =============================================================================

test('initialState creates idle state', t => {
	const config = makeConfig();
	const state = initialState(config);
	t.is(state.status, 'idle');
	t.deepEqual(state.events, []);
	t.is(state.iterations, 0);
	t.is(state.errorCount, 0);
});

test('initialState validates config', t => {
	t.throws(() =>
		initialState({
			systemPrompt: 'test',
			maxIterations: -1,
			maxErrors: 0,
		}),
	);
});

test('initialState accepts valid config', t => {
	const state = initialState({
		systemPrompt: 'test',
		maxIterations: 5,
		maxErrors: 2,
	});
	t.is(state.status, 'idle');
});

// =============================================================================
// reduce — user_input
// =============================================================================

test('reduce user_input sets status to running', t => {
	const state = makeState();
	const event: AgentEvent = {
		type: 'user_input',
		message: {role: 'user', content: 'hello'},
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(next.status, 'running');
	t.is(next.events.length, 1);
	t.is(next.events[0]!.type, 'user_input');
});

// =============================================================================
// reduce — model_response
// =============================================================================

test('reduce model_response increments iterations', t => {
	const state = makeState({status: 'running', iterations: 2});
	const event: AgentEvent = {
		type: 'model_response',
		result: {content: 'hi'},
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(next.status, 'running');
	t.is(next.iterations, 3);
});

// =============================================================================
// reduce — tool_call
// =============================================================================

test('reduce tool_call keeps running status', t => {
	const state = makeState({status: 'running'});
	const event: AgentEvent = {
		type: 'tool_call',
		toolCall: {id: 'tc-1', name: 'bash', args: {command: 'ls'}},
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(next.status, 'running');
	t.is(next.events.length, 1);
});

// =============================================================================
// reduce — tool_result
// =============================================================================

test('reduce tool_result keeps running status', t => {
	const state = makeState({status: 'running'});
	const event: AgentEvent = {
		type: 'tool_result',
		result: {toolCallId: 'tc-1', content: 'output'},
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(next.status, 'running');
});

// =============================================================================
// reduce — error (recoverable)
// =============================================================================

test('reduce recoverable error stays running', t => {
	const state = makeState({status: 'running', errorCount: 0});
	const event: AgentEvent = {
		type: 'error',
		error: {
			message: 'oops',
			attempt: 1,
			maxAttempts: 3,
			recoverable: true,
			timestamp: Date.now(),
		},
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(next.status, 'running');
	t.is(next.errorCount, 1);
});

// =============================================================================
// reduce — error (fatal)
// =============================================================================

test('reduce fatal error sets status to error', t => {
	const state = makeState({status: 'running', errorCount: 2});
	const event: AgentEvent = {
		type: 'error',
		error: {
			message: 'fatal',
			attempt: 3,
			maxAttempts: 3,
			recoverable: false,
			timestamp: Date.now(),
		},
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(next.status, 'error');
	t.is(next.errorCount, 3);
});

// =============================================================================
// reduce — human_contact
// =============================================================================

test('reduce human_contact sets waiting_for_human', t => {
	const state = makeState({status: 'running'});
	const event: AgentEvent = {
		type: 'human_contact',
		request: {message: 'need help'},
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(next.status, 'waiting_for_human');
});

// =============================================================================
// reduce — done
// =============================================================================

test('reduce done sets status to done', t => {
	const state = makeState({status: 'running'});
	const event: AgentEvent = {
		type: 'done',
		reason: 'finished',
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(next.status, 'done');
});

// =============================================================================
// reduce — immutability
// =============================================================================

test('reduce does not mutate original state', t => {
	const state = makeState({status: 'running'});
	const event: AgentEvent = {
		type: 'done',
		reason: 'finished',
		timestamp: Date.now(),
	};
	const next = reduce(state, event);
	t.is(state.status, 'running');
	t.is(next.status, 'done');
	t.is(state.events.length, 0);
	t.is(next.events.length, 1);
});

// =============================================================================
// nextAction — idle state
// =============================================================================

test('nextAction for idle state returns call_model', t => {
	const state = makeState({status: 'idle'});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'call_model');
});

// =============================================================================
// nextAction — done state
// =============================================================================

test('nextAction for done state returns done', t => {
	const state = makeState({status: 'done'});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'done');
});

// =============================================================================
// nextAction — error state
// =============================================================================

test('nextAction for error state returns error', t => {
	const state = makeState({status: 'error'});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'error');
});

// =============================================================================
// nextAction — waiting_for_human
// =============================================================================

test('nextAction for waiting_for_human returns contact_human', t => {
	const state = makeState({
		status: 'waiting_for_human',
		events: [
			{
				type: 'human_contact',
				request: {message: 'help me'},
				timestamp: Date.now(),
			},
		],
	});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'contact_human');
	t.truthy(action.humanRequest);
	t.is(action.humanRequest!.message, 'help me');
});

// =============================================================================
// nextAction — iteration limit
// =============================================================================

test('nextAction returns done when iterations reach maxIterations', t => {
	const config = makeConfig({maxIterations: 3});
	const state = makeState({status: 'running', iterations: 3});
	const action = nextAction(state, config);
	t.is(action.type, 'done');
	t.is(action.reason, 'Max iterations reached');
});

// =============================================================================
// nextAction — error limit
// =============================================================================

test('nextAction returns error when errorCount exceeds maxErrors', t => {
	const config = makeConfig({maxErrors: 2});
	const state = makeState({status: 'running', errorCount: 3});
	const action = nextAction(state, config);
	t.is(action.type, 'error');
	t.is(action.reason, 'Max errors exceeded');
});

// =============================================================================
// nextAction — after user_input
// =============================================================================

test('nextAction after user_input returns call_model', t => {
	const state = makeState({
		status: 'running',
		events: [
			{
				type: 'user_input',
				message: {role: 'user', content: 'hi'},
				timestamp: Date.now(),
			},
		],
	});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'call_model');
});

// =============================================================================
// nextAction — after model_response with tool calls
// =============================================================================

test('nextAction after model_response with tool calls returns execute_tool', t => {
	const toolCall: ToolCall = {id: 'tc-1', name: 'bash', args: {command: 'ls'}};
	const state = makeState({
		status: 'running',
		events: [
			{
				type: 'model_response',
				result: {content: '', toolCalls: [toolCall]},
				timestamp: Date.now(),
			},
		],
	});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'execute_tool');
	t.truthy(action.toolCall);
	t.is(action.toolCall!.name, 'bash');
});

// =============================================================================
// nextAction — after model_response with done
// =============================================================================

test('nextAction after model_response with done returns done', t => {
	const state = makeState({
		status: 'running',
		events: [
			{
				type: 'model_response',
				result: {content: 'all done', done: true},
				timestamp: Date.now(),
			},
		],
	});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'done');
});

// =============================================================================
// nextAction — after model_response with no tool calls and not done
// =============================================================================

test('nextAction after model_response with no tool calls returns done', t => {
	const state = makeState({
		status: 'running',
		events: [
			{
				type: 'model_response',
				result: {content: 'finished'},
				timestamp: Date.now(),
			},
		],
	});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'done');
});

// =============================================================================
// nextAction — after tool_result with more pending
// =============================================================================

test('nextAction after tool_result with pending tool calls returns execute_tool', t => {
	const tc1: ToolCall = {id: 'tc-1', name: 'bash', args: {command: 'ls'}};
	const tc2: ToolCall = {id: 'tc-2', name: 'echo', args: {msg: 'hi'}};
	const state = makeState({
		status: 'running',
		events: [
			{
				type: 'model_response',
				result: {content: '', toolCalls: [tc1, tc2]},
				timestamp: Date.now(),
			},
			{
				type: 'tool_call',
				toolCall: tc1,
				timestamp: Date.now(),
			},
			{
				type: 'tool_result',
				result: {toolCallId: 'tc-1', content: 'files'},
				timestamp: Date.now(),
			},
		],
	});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'execute_tool');
	t.is(action.toolCall!.id, 'tc-2');
});

// =============================================================================
// nextAction — after tool_result with no pending
// =============================================================================

test('nextAction after tool_result with no pending returns call_model', t => {
	const tc1: ToolCall = {id: 'tc-1', name: 'bash', args: {command: 'ls'}};
	const state = makeState({
		status: 'running',
		events: [
			{
				type: 'model_response',
				result: {content: '', toolCalls: [tc1]},
				timestamp: Date.now(),
			},
			{
				type: 'tool_call',
				toolCall: tc1,
				timestamp: Date.now(),
			},
			{
				type: 'tool_result',
				result: {toolCallId: 'tc-1', content: 'files'},
				timestamp: Date.now(),
			},
		],
	});
	const config = makeConfig();
	const action = nextAction(state, config);
	t.is(action.type, 'call_model');
});

// =============================================================================
// nextAction — after recoverable error
// =============================================================================

test('nextAction after recoverable error returns call_model', t => {
	const state = makeState({
		status: 'running',
		errorCount: 1,
		events: [
			{
				type: 'error',
				error: {
					message: 'oops',
					attempt: 1,
					maxAttempts: 3,
					recoverable: true,
					timestamp: Date.now(),
				},
				timestamp: Date.now(),
			},
		],
	});
	const config = makeConfig({maxErrors: 3});
	const action = nextAction(state, config);
	t.is(action.type, 'call_model');
});

// =============================================================================
// runAgent — simple text response
// =============================================================================

test('runAgent completes with simple model response', async t => {
	const model = makeModel([{content: 'Hello!', done: true}]);
	const registry = createToolRegistry();
	const config = makeConfig();

	const state = await runAgent({
		input: 'hi',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'done');
	t.true(state.iterations > 0);
});

// =============================================================================
// runAgent — tool execution
// =============================================================================

test('runAgent executes tool calls', async t => {
	const tc: ToolCall = {id: 'tc-1', name: 'echo', args: {text: 'hello'}};
	const model = makeModel([
		{content: '', toolCalls: [tc]},
		{content: 'Done!', done: true},
	]);
	const registry = createToolRegistry();
	registry.register(
		{name: 'echo', description: 'Echo text', parameters: {}},
		async args => `echoed: ${String(args['text'])}`,
	);
	const config = makeConfig();

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'done');

	// Should have tool_call and tool_result events
	const toolCalls = state.events.filter(e => e.type === 'tool_call');
	const toolResults = state.events.filter(e => e.type === 'tool_result');
	t.is(toolCalls.length, 1);
	t.is(toolResults.length, 1);
});

// =============================================================================
// runAgent — multiple tool calls in one response
// =============================================================================

test('runAgent executes multiple tool calls from single model response', async t => {
	const tc1: ToolCall = {id: 'tc-1', name: 'echo', args: {text: 'a'}};
	const tc2: ToolCall = {id: 'tc-2', name: 'echo', args: {text: 'b'}};
	const model = makeModel([
		{content: '', toolCalls: [tc1, tc2]},
		{content: 'Done!', done: true},
	]);
	const registry = createToolRegistry();
	registry.register(
		{name: 'echo', description: 'Echo text', parameters: {}},
		async args => `echoed: ${String(args['text'])}`,
	);
	const config = makeConfig();

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'done');

	const toolResults = state.events.filter(e => e.type === 'tool_result');
	t.is(toolResults.length, 2);
});

// =============================================================================
// runAgent — iteration limit
// =============================================================================

test('runAgent respects maxIterations', async t => {
	// Model never says done, always returns content without done
	const model: ModelInterface = {
		async invoke(): Promise<ModelResult> {
			return {content: 'still going'};
		},
	};
	const registry = createToolRegistry();
	const config = makeConfig({maxIterations: 3});

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'done');
	t.true(state.iterations <= 3);
});

// =============================================================================
// runAgent — error recovery
// =============================================================================

test('runAgent recovers from model errors', async t => {
	let callCount = 0;
	const model: ModelInterface = {
		async invoke(): Promise<ModelResult> {
			callCount++;
			if (callCount === 1) {
				throw new Error('model failed');
			}

			return {content: 'recovered', done: true};
		},
	};
	const registry = createToolRegistry();
	const config = makeConfig({maxErrors: 3});

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'done');
	t.is(state.errorCount, 1);
});

// =============================================================================
// runAgent — fatal errors (maxErrors exceeded)
// =============================================================================

test('runAgent stops when maxErrors exceeded', async t => {
	const model = makeFailingModel(new Error('always fails'));
	const registry = createToolRegistry();
	const config = makeConfig({maxErrors: 2});

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'error');
	t.true(state.errorCount > 0);
});

// =============================================================================
// runAgent — middleware hooks
// =============================================================================

test('runAgent calls middleware onEvent hooks', async t => {
	const eventTypes: string[] = [];
	const middleware = createMiddlewareStack();
	middleware.use({
		name: 'tracker',
		async onEvent(event) {
			eventTypes.push(event.type);
		},
	});

	const model = makeModel([{content: 'hello', done: true}]);
	const registry = createToolRegistry();
	const config = makeConfig();

	await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
		middleware,
	});

	t.true(eventTypes.includes('user_input'));
	t.true(eventTypes.includes('model_response'));
	t.true(eventTypes.includes('done'));
});

// =============================================================================
// runAgent — beforeModel middleware
// =============================================================================

test('runAgent calls beforeModel middleware', async t => {
	let beforeModelCalled = false;
	const middleware = createMiddlewareStack();
	middleware.use({
		name: 'interceptor',
		async beforeModel(messages) {
			beforeModelCalled = true;
			return messages;
		},
	});

	const model = makeModel([{content: 'ok', done: true}]);
	const registry = createToolRegistry();
	const config = makeConfig();

	await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
		middleware,
	});

	t.true(beforeModelCalled);
});

// =============================================================================
// runAgent — beforeToolExecution can skip
// =============================================================================

test('runAgent skips tool when beforeToolExecution returns false', async t => {
	const middleware = createMiddlewareStack();
	middleware.use({
		name: 'blocker',
		async beforeToolExecution() {
			return false;
		},
	});

	const tc: ToolCall = {id: 'tc-1', name: 'echo', args: {}};
	const model = makeModel([
		{content: '', toolCalls: [tc]},
		{content: 'ok', done: true},
	]);
	const registry = createToolRegistry();
	registry.register(
		{name: 'echo', description: 'Echo', parameters: {}},
		async () => 'should not execute',
	);
	const config = makeConfig();

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
		middleware,
	});

	// Tool result should indicate skip
	const toolResults = state.events.filter(e => e.type === 'tool_result');
	t.is(toolResults.length, 1);
	const result = toolResults[0]!;
	if (result.type === 'tool_result') {
		t.true(result.result.isError);
		t.true(result.result.content.includes('skipped'));
	}
});

// =============================================================================
// runAgent — human contact handler
// =============================================================================

test('runAgent handles human contact with handler', async t => {
	let callCount = 0;
	const model: ModelInterface = {
		async invoke(): Promise<ModelResult> {
			callCount++;
			if (callCount === 1) {
				return {
					content: '',
					toolCalls: [
						{id: 'tc-1', name: 'contact_human', args: {message: 'need input'}},
					],
				};
			}

			return {content: 'done', done: true};
		},
	};

	const registry = createToolRegistry();
	registry.register(
		{name: 'contact_human', description: 'Contact human', parameters: {}},
		async () => 'human response placeholder',
	);
	const config = makeConfig();

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'done');
});

// =============================================================================
// runAgent — validates config
// =============================================================================

test('runAgent validates config', async t => {
	const model = makeModel([{content: 'ok', done: true}]);
	const registry = createToolRegistry();

	await t.throwsAsync(async () =>
		runAgent({
			input: 'test',
			model,
			toolRegistry: registry,
			config: {
				systemPrompt: 'test',
				maxIterations: -1,
				maxErrors: 0,
			},
		}),
	);
});

// =============================================================================
// runAgent — no middleware (no-op passthrough)
// =============================================================================

test('runAgent works without middleware', async t => {
	const model = makeModel([{content: 'hello', done: true}]);
	const registry = createToolRegistry();
	const config = makeConfig();

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'done');
});

// =============================================================================
// runAgent — tool error captured as ToolResult with isError
// =============================================================================

test('runAgent captures tool execution errors', async t => {
	const tc: ToolCall = {id: 'tc-1', name: 'failing', args: {}};
	const model = makeModel([
		{content: '', toolCalls: [tc]},
		{content: 'handled', done: true},
	]);
	const registry = createToolRegistry();
	registry.register(
		{name: 'failing', description: 'Always fails', parameters: {}},
		async () => {
			throw new Error('tool broke');
		},
	);
	const config = makeConfig();

	const state = await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});
	t.is(state.status, 'done');

	// Tool result should have isError
	const toolResults = state.events.filter(e => e.type === 'tool_result');
	t.is(toolResults.length, 1);
	const result = toolResults[0]!;
	if (result.type === 'tool_result') {
		t.true(result.result.isError);
	}
});

// =============================================================================
// runAgent — onError middleware called on model failure
// =============================================================================

test('runAgent calls onError middleware on model failure', async t => {
	const errors: string[] = [];
	const middleware = createMiddlewareStack();
	middleware.use({
		name: 'error-tracker',
		async onError(error) {
			errors.push(error.message);
		},
	});

	let callCount = 0;
	const model: ModelInterface = {
		async invoke(): Promise<ModelResult> {
			callCount++;
			if (callCount === 1) {
				throw new Error('model broke');
			}

			return {content: 'recovered', done: true};
		},
	};
	const registry = createToolRegistry();
	const config = makeConfig({maxErrors: 3});

	await runAgent({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
		middleware,
	});
	t.true(errors.includes('model broke'));
});
