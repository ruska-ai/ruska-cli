/**
 * Tests for runAgentStream — async generator that yields events in real-time.
 * Covers US-016: Add Event Emitter Adapter (runAgentStream)
 */

import test from 'ava';
import {
	type AgentConfig,
	type AgentEvent,
	type ModelResult,
	type ToolCall,
} from '../core/schemas.js';
import {createToolRegistry} from '../core/tool.js';
import {type ModelInterface} from '../core/model.js';
import {runAgentStream, runAgent} from '../core/agent.js';

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

// =============================================================================
// runAgentStream — yields tool_call and tool_result events before done
// =============================================================================

test('runAgentStream yields events including tool_call and tool_result', async t => {
	const tc: ToolCall = {id: 'tc-1', name: 'echo', args: {text: 'hello'}};
	const model = makeModel([
		{content: '', toolCalls: [tc]},
		{content: 'Done!', done: true},
	]);
	const registry = createToolRegistry();
	registry.register(
		{name: 'echo', description: 'Echo text', parameters: {}},
		async (args) => `echoed: ${String(args['text'])}`,
	);
	const config = makeConfig();

	const events: AgentEvent[] = [];
	const generator = runAgentStream({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});

	let result = await generator.next();
	while (!result.done) {
		events.push(result.value);
		// eslint-disable-next-line no-await-in-loop
		result = await generator.next();
	}

	const finalState = result.value;

	// Should have user_input, model_response, tool_call, tool_result, model_response, done
	const eventTypes = new Set(events.map(e => e.type));
	t.true(eventTypes.has('user_input'));
	t.true(eventTypes.has('model_response'));
	t.true(eventTypes.has('tool_call'));
	t.true(eventTypes.has('tool_result'));
	t.true(eventTypes.has('done'));

	// Final state should be done
	t.is(finalState.status, 'done');
});

// =============================================================================
// runAgentStream — existing runAgent behavior unchanged
// =============================================================================

test('runAgent still works correctly after refactor', async t => {
	const tc: ToolCall = {id: 'tc-1', name: 'echo', args: {text: 'hi'}};
	const model = makeModel([
		{content: '', toolCalls: [tc]},
		{content: 'Done!', done: true},
	]);
	const registry = createToolRegistry();
	registry.register(
		{name: 'echo', description: 'Echo text', parameters: {}},
		async (args) => `echoed: ${String(args['text'])}`,
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
// runAgentStream — simple text response yields events
// =============================================================================

test('runAgentStream yields user_input, model_response, and done for simple response', async t => {
	const model = makeModel([{content: 'Hello!', done: true}]);
	const registry = createToolRegistry();
	const config = makeConfig();

	const events: AgentEvent[] = [];
	const generator = runAgentStream({
		input: 'hi',
		model,
		toolRegistry: registry,
		config,
	});

	let result = await generator.next();
	while (!result.done) {
		events.push(result.value);
		// eslint-disable-next-line no-await-in-loop
		result = await generator.next();
	}

	const eventTypes = events.map(e => e.type);
	t.deepEqual(eventTypes, ['user_input', 'model_response', 'done']);
	t.is(result.value.status, 'done');
});

// =============================================================================
// runAgentStream — onEvent callback fires for each event
// =============================================================================

test('runAgentStream calls onEvent callback for each yielded event', async t => {
	const model = makeModel([{content: 'Hello!', done: true}]);
	const registry = createToolRegistry();
	const config = makeConfig();

	const callbackEvents: AgentEvent[] = [];
	const generator = runAgentStream({
		input: 'hi',
		model,
		toolRegistry: registry,
		config,
		onEvent(event) {
			callbackEvents.push(event);
		},
	});

	const yieldedEvents: AgentEvent[] = [];
	let result = await generator.next();
	while (!result.done) {
		yieldedEvents.push(result.value);
		// eslint-disable-next-line no-await-in-loop
		result = await generator.next();
	}

	// Callback events should match yielded events
	t.is(callbackEvents.length, yieldedEvents.length);
	for (const [index, callbackEvent] of callbackEvents.entries()) {
		t.is(callbackEvent.type, yieldedEvents[index]!.type);
	}
});

// =============================================================================
// runAgentStream — error recovery yields error events
// =============================================================================

test('runAgentStream yields error events on model failure', async t => {
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

	const events: AgentEvent[] = [];
	const generator = runAgentStream({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});

	let result = await generator.next();
	while (!result.done) {
		events.push(result.value);
		// eslint-disable-next-line no-await-in-loop
		result = await generator.next();
	}

	const eventTypes = events.map(e => e.type);
	t.true(eventTypes.includes('error'));
	t.is(result.value.status, 'done');
	t.is(result.value.errorCount, 1);
});

// =============================================================================
// runAgentStream — multiple tool calls yield multiple events
// =============================================================================

test('runAgentStream yields events for multiple tool calls', async t => {
	const tc1: ToolCall = {id: 'tc-1', name: 'echo', args: {text: 'a'}};
	const tc2: ToolCall = {id: 'tc-2', name: 'echo', args: {text: 'b'}};
	const model = makeModel([
		{content: '', toolCalls: [tc1, tc2]},
		{content: 'Done!', done: true},
	]);
	const registry = createToolRegistry();
	registry.register(
		{name: 'echo', description: 'Echo text', parameters: {}},
		async (args) => `echoed: ${String(args['text'])}`,
	);
	const config = makeConfig();

	const events: AgentEvent[] = [];
	const generator = runAgentStream({
		input: 'test',
		model,
		toolRegistry: registry,
		config,
	});

	let result = await generator.next();
	while (!result.done) {
		events.push(result.value);
		// eslint-disable-next-line no-await-in-loop
		result = await generator.next();
	}

	const toolCallEvents = events.filter(e => e.type === 'tool_call');
	const toolResultEvents = events.filter(e => e.type === 'tool_result');
	t.is(toolCallEvents.length, 2);
	t.is(toolResultEvents.length, 2);
});

// =============================================================================
// runAgentStream — return type is AsyncGenerator<AgentEvent, AgentState>
// =============================================================================

test('runAgentStream returns final state as generator return value', async t => {
	const model = makeModel([{content: 'Hello!', done: true}]);
	const registry = createToolRegistry();
	const config = makeConfig();

	const generator = runAgentStream({
		input: 'hi',
		model,
		toolRegistry: registry,
		config,
	});

	let result = await generator.next();
	while (!result.done) {
		// eslint-disable-next-line no-await-in-loop
		result = await generator.next();
	}

	// Final result.done === true means result.value is the return type (AgentState)
	t.true(result.done);
	t.is(result.value.status, 'done');
	t.true(result.value.iterations > 0);
	t.is(result.value.errorCount, 0);
});
