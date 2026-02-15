import test from 'ava';
import {
	createMiddlewareStack,
	type Middleware,
} from '../core/middleware.js';
import {
	type AgentEvent,
	type AgentState,
	type CoreMessage,
	type ToolCall,
	type ToolResult,
	type CompactError,
} from '../core/schemas.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<AgentState>): AgentState {
	return {
		status: 'running',
		events: [],
		iterations: 0,
		errorCount: 0,
		...overrides,
	};
}

function makeToolCall(overrides?: Partial<ToolCall>): ToolCall {
	return {
		id: 'tc-1',
		name: 'test_tool',
		args: {},
		...overrides,
	};
}

function makeToolResult(overrides?: Partial<ToolResult>): ToolResult {
	return {
		toolCallId: 'tc-1',
		content: 'result',
		...overrides,
	};
}

function makeEvent(): AgentEvent {
	const event: AgentEvent = {
		type: 'user_input',
		message: {role: 'user', content: 'hello'},
		timestamp: Date.now(),
	};
	return event;
}

function makeCompactError(overrides?: Partial<CompactError>): CompactError {
	return {
		message: 'something went wrong',
		attempt: 1,
		maxAttempts: 3,
		recoverable: true,
		timestamp: Date.now(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test('use() registers middleware', (t) => {
	const stack = createMiddlewareStack();
	const mw: Middleware = {name: 'test-mw'};
	// Should not throw
	stack.use(mw);
	t.pass();
});

// ---------------------------------------------------------------------------
// No-op passthrough (empty stack)
// ---------------------------------------------------------------------------

test('runOnEvent with no middleware is a no-op', async (t) => {
	const stack = createMiddlewareStack();
	await stack.runOnEvent(makeEvent(), makeState());
	t.pass();
});

test('runOnError with no middleware is a no-op', async (t) => {
	const stack = createMiddlewareStack();
	await stack.runOnError(makeCompactError(), makeState());
	t.pass();
});

test('runBeforeModel with no middleware returns messages unchanged', async (t) => {
	const stack = createMiddlewareStack();
	const messages: CoreMessage[] = [{role: 'user', content: 'hi'}];
	const result = await stack.runBeforeModel(messages, makeState());
	t.deepEqual(result, messages);
});

test('runBeforePrompt with no middleware returns prompt unchanged', async (t) => {
	const stack = createMiddlewareStack();
	const result = await stack.runBeforePrompt('hello', makeState());
	t.is(result, 'hello');
});

test('runBeforeToolExecution with no middleware returns true', async (t) => {
	const stack = createMiddlewareStack();
	const result = await stack.runBeforeToolExecution(
		makeToolCall(),
		makeState(),
	);
	t.true(result);
});

test('runAfterToolExecution with no middleware is a no-op', async (t) => {
	const stack = createMiddlewareStack();
	await stack.runAfterToolExecution(
		makeToolCall(),
		makeToolResult(),
		makeState(),
	);
	t.pass();
});

// ---------------------------------------------------------------------------
// Execution order
// ---------------------------------------------------------------------------

test('onEvent hooks execute in registration order', async (t) => {
	const stack = createMiddlewareStack();
	const order: number[] = [];

	stack.use({
		onEvent() {
			order.push(1);
		},
	});
	stack.use({
		onEvent() {
			order.push(2);
		},
	});
	stack.use({
		onEvent() {
			order.push(3);
		},
	});

	await stack.runOnEvent(makeEvent(), makeState());
	t.deepEqual(order, [1, 2, 3]);
});

test('onError hooks execute in registration order', async (t) => {
	const stack = createMiddlewareStack();
	const order: number[] = [];

	stack.use({
		onError() {
			order.push(1);
		},
	});
	stack.use({
		onError() {
			order.push(2);
		},
	});

	await stack.runOnError(makeCompactError(), makeState());
	t.deepEqual(order, [1, 2]);
});

test('beforeModel hooks chain in registration order', async (t) => {
	const stack = createMiddlewareStack();

	stack.use({
		beforeModel(messages) {
			return [...messages, {role: 'system' as const, content: 'first'}];
		},
	});
	stack.use({
		beforeModel(messages) {
			return [...messages, {role: 'system' as const, content: 'second'}];
		},
	});

	const result = await stack.runBeforeModel(
		[{role: 'user', content: 'hi'}],
		makeState(),
	);

	t.is(result.length, 3);
	t.is(result[0]!.content, 'hi');
	t.is(result[1]!.content, 'first');
	t.is(result[2]!.content, 'second');
});

test('beforePrompt hooks chain in registration order', async (t) => {
	const stack = createMiddlewareStack();

	stack.use({
		beforePrompt(prompt) {
			return prompt + ' [A]';
		},
	});
	stack.use({
		beforePrompt(prompt) {
			return prompt + ' [B]';
		},
	});

	const result = await stack.runBeforePrompt('base', makeState());
	t.is(result, 'base [A] [B]');
});

test('beforeToolExecution hooks execute in order until one returns false', async (t) => {
	const stack = createMiddlewareStack();
	const order: number[] = [];

	stack.use({
		beforeToolExecution() {
			order.push(1);
			return true;
		},
	});
	stack.use({
		beforeToolExecution() {
			order.push(2);
			return false; // Skip execution
		},
	});
	stack.use({
		beforeToolExecution() {
			order.push(3); // Should not be called
			return true;
		},
	});

	const result = await stack.runBeforeToolExecution(
		makeToolCall(),
		makeState(),
	);
	t.false(result);
	t.deepEqual(order, [1, 2]); // Third middleware not reached
});

test('beforeToolExecution returns true when all middleware return true', async (t) => {
	const stack = createMiddlewareStack();

	stack.use({
		beforeToolExecution() {
			return true;
		},
	});
	stack.use({
		beforeToolExecution() {
			return true;
		},
	});

	const result = await stack.runBeforeToolExecution(
		makeToolCall(),
		makeState(),
	);
	t.true(result);
});

test('afterToolExecution hooks execute in registration order', async (t) => {
	const stack = createMiddlewareStack();
	const order: number[] = [];

	stack.use({
		afterToolExecution() {
			order.push(1);
		},
	});
	stack.use({
		afterToolExecution() {
			order.push(2);
		},
	});

	await stack.runAfterToolExecution(
		makeToolCall(),
		makeToolResult(),
		makeState(),
	);
	t.deepEqual(order, [1, 2]);
});

// ---------------------------------------------------------------------------
// Each hook type receives correct arguments
// ---------------------------------------------------------------------------

test('onEvent receives event and state', async (t) => {
	const stack = createMiddlewareStack();
	const event = makeEvent();
	const state = makeState();

	stack.use({
		onEvent(e, s) {
			t.is(e, event);
			t.is(s, state);
		},
	});

	await stack.runOnEvent(event, state);
});

test('onError receives error and state', async (t) => {
	const stack = createMiddlewareStack();
	const error = makeCompactError();
	const state = makeState();

	stack.use({
		onError(e, s) {
			t.is(e, error);
			t.is(s, state);
		},
	});

	await stack.runOnError(error, state);
});

test('beforeModel receives messages and state', async (t) => {
	const stack = createMiddlewareStack();
	const messages: CoreMessage[] = [{role: 'user', content: 'hi'}];
	const state = makeState();

	stack.use({
		beforeModel(m, s) {
			t.deepEqual(m, messages);
			t.is(s, state);
			return m;
		},
	});

	await stack.runBeforeModel(messages, state);
});

test('beforePrompt receives prompt and state', async (t) => {
	const stack = createMiddlewareStack();
	const state = makeState();

	stack.use({
		beforePrompt(p, s) {
			t.is(p, 'test prompt');
			t.is(s, state);
			return p;
		},
	});

	await stack.runBeforePrompt('test prompt', state);
});

test('beforeToolExecution receives toolCall and state', async (t) => {
	const stack = createMiddlewareStack();
	const toolCall = makeToolCall();
	const state = makeState();

	stack.use({
		beforeToolExecution(tc, s) {
			t.is(tc, toolCall);
			t.is(s, state);
			return true;
		},
	});

	await stack.runBeforeToolExecution(toolCall, state);
});

test('afterToolExecution receives toolCall, result, and state', async (t) => {
	const stack = createMiddlewareStack();
	const toolCall = makeToolCall();
	const toolResult = makeToolResult();
	const state = makeState();

	stack.use({
		afterToolExecution(tc, r, s) {
			t.is(tc, toolCall);
			t.is(r, toolResult);
			t.is(s, state);
		},
	});

	await stack.runAfterToolExecution(toolCall, toolResult, state);
});

// ---------------------------------------------------------------------------
// Async hooks
// ---------------------------------------------------------------------------

test('onEvent supports async hooks', async (t) => {
	const stack = createMiddlewareStack();
	let called = false;

	stack.use({
		async onEvent() {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			called = true;
		},
	});

	await stack.runOnEvent(makeEvent(), makeState());
	t.true(called);
});

test('beforeModel supports async hooks', async (t) => {
	const stack = createMiddlewareStack();

	stack.use({
		async beforeModel(messages) {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			return [...messages, {role: 'system' as const, content: 'async'}];
		},
	});

	const result = await stack.runBeforeModel(
		[{role: 'user', content: 'hi'}],
		makeState(),
	);
	t.is(result.length, 2);
	t.is(result[1]!.content, 'async');
});

test('beforePrompt supports async hooks', async (t) => {
	const stack = createMiddlewareStack();

	stack.use({
		async beforePrompt(prompt) {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			return prompt + ' [async]';
		},
	});

	const result = await stack.runBeforePrompt('base', makeState());
	t.is(result, 'base [async]');
});

test('beforeToolExecution supports async hooks', async (t) => {
	const stack = createMiddlewareStack();

	stack.use({
		async beforeToolExecution() {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			return false;
		},
	});

	const result = await stack.runBeforeToolExecution(
		makeToolCall(),
		makeState(),
	);
	t.false(result);
});

test('afterToolExecution supports async hooks', async (t) => {
	const stack = createMiddlewareStack();
	let called = false;

	stack.use({
		async afterToolExecution() {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			called = true;
		},
	});

	await stack.runAfterToolExecution(
		makeToolCall(),
		makeToolResult(),
		makeState(),
	);
	t.true(called);
});

test('onError supports async hooks', async (t) => {
	const stack = createMiddlewareStack();
	let called = false;

	stack.use({
		async onError() {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			called = true;
		},
	});

	await stack.runOnError(makeCompactError(), makeState());
	t.true(called);
});

// ---------------------------------------------------------------------------
// Middleware with only some hooks
// ---------------------------------------------------------------------------

test('middleware with partial hooks works correctly', async (t) => {
	const stack = createMiddlewareStack();
	const order: string[] = [];

	// First middleware only has onEvent
	stack.use({
		onEvent() {
			order.push('onEvent');
		},
	});

	// Second middleware only has beforeModel
	stack.use({
		beforeModel(messages) {
			order.push('beforeModel');
			return messages;
		},
	});

	await stack.runOnEvent(makeEvent(), makeState());
	await stack.runBeforeModel([{role: 'user', content: 'hi'}], makeState());

	t.deepEqual(order, ['onEvent', 'beforeModel']);
});

// ---------------------------------------------------------------------------
// Mixed sync and async middleware
// ---------------------------------------------------------------------------

test('sync and async middleware can be mixed', async (t) => {
	const stack = createMiddlewareStack();
	const order: number[] = [];

	stack.use({
		onEvent() {
			order.push(1); // Sync
		},
	});
	stack.use({
		async onEvent() {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 10);
			});
			order.push(2); // Async
		},
	});
	stack.use({
		onEvent() {
			order.push(3); // Sync
		},
	});

	await stack.runOnEvent(makeEvent(), makeState());
	t.deepEqual(order, [1, 2, 3]);
});
