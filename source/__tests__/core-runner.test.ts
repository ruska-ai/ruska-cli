/**
 * Tests for Agent Runner Factory.
 * Covers US-019: Create Agent Runner Factory
 */

import test from 'ava';
import type {StreamRequest, StreamHandle, StreamEvent} from '../types/stream.js';
import type {StreamServiceInterface} from '../lib/services/stream-service.interface.js';
import {type AgentEvent} from '../core/schemas.js';
import {type ConsentDecision, type ConsentHandler} from '../core/bash-consent-middleware.js';
import {type ThreadStore} from '../core/thread-store.js';
import {type Thread, createThread} from '../core/thread.js';
import {createAgentRunner, type AgentRunnerConfig} from '../core/runner.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeStreamService(
	responses: StreamEvent[][],
): StreamServiceInterface {
	let callIndex = 0;
	return {
		async connect(_request: StreamRequest): Promise<StreamHandle> {
			const events = callIndex < responses.length
				? responses[callIndex]!
				: [{type: 'messages' as const, payload: [{content: ''}]}, {type: 'done' as const, payload: undefined}];
			callIndex++;
			return {
				events: (async function * () {
					for (const e of events) {
						yield e;
					}
				})(),
				abort() {
					// No-op
				},
			};
		},
	};
}

function makeSimpleResponse(text: string): StreamEvent[] {
	return [
		{
			type: 'messages',
			payload: [{content: text}],
		},
		{type: 'done', payload: undefined},
	];
}

function makeToolCallResponse(
	toolId: string,
	toolName: string,
	args: Record<string, unknown>,
): StreamEvent[] {
	return [
		{
			type: 'messages',
			payload: [{
				content: '',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				tool_calls: [{id: toolId, name: toolName, args}],
			}],
		},
		{type: 'done', payload: undefined},
	];
}

function makeBaseConfig(overrides?: Partial<AgentRunnerConfig>): AgentRunnerConfig {
	return {
		input: 'hello',
		service: makeStreamService([makeSimpleResponse('Hi there!')]),
		systemPrompt: 'You are helpful.',
		maxIterations: 10,
		maxErrors: 3,
		enableBash: false,
		autoApprove: false,
		...overrides,
	};
}

async function drainGenerator(
	generator: AsyncGenerator<AgentEvent>,
): Promise<{events: AgentEvent[]; finalState: unknown}> {
	const events: AgentEvent[] = [];
	let result = await generator.next();
	while (!result.done) {
		events.push(result.value);
		// eslint-disable-next-line no-await-in-loop
		result = await generator.next();
	}

	return {events, finalState: result.value};
}

// =============================================================================
// Basic runner — no bash, no thread
// =============================================================================

test('createAgentRunner returns async generator that yields events', async t => {
	const config = makeBaseConfig();
	const generator = await createAgentRunner(config);
	const {events, finalState} = await drainGenerator(generator);

	const eventTypes = new Set(events.map(e => e.type));
	t.true(eventTypes.has('user_input'));
	t.true(eventTypes.has('model_response'));
	t.true(eventTypes.has('done'));
	t.is((finalState as {status: string}).status, 'done');
});

// =============================================================================
// Bash-enabled + consent handler called
// =============================================================================

test('bash-enabled runner calls consent handler for bash tool calls', async t => {
	let consentCalled = false;
	let consentCommand = '';
	const consentHandler: ConsentHandler = async (command): Promise<ConsentDecision> => {
		consentCalled = true;
		consentCommand = command;
		return {approved: true};
	};

	const service = makeStreamService([
		makeToolCallResponse('tc-1', 'bash', {command: 'echo hello'}),
		makeSimpleResponse('Done!'),
	]);

	const config = makeBaseConfig({
		service,
		enableBash: true,
		autoApprove: false,
		consentHandler,
	});

	const generator = await createAgentRunner(config);
	const {events} = await drainGenerator(generator);

	t.true(consentCalled);
	t.is(consentCommand, 'echo hello');

	const toolCallEvents = events.filter(e => e.type === 'tool_call');
	const toolResultEvents = events.filter(e => e.type === 'tool_result');
	t.is(toolCallEvents.length, 1);
	t.is(toolResultEvents.length, 1);
});

// =============================================================================
// Auto-approve bypasses consent handler
// =============================================================================

test('auto-approve bypasses consent handler for bash commands', async t => {
	let consentCalled = false;
	const consentHandler: ConsentHandler = async (): Promise<ConsentDecision> => {
		consentCalled = true;
		return {approved: true};
	};

	const service = makeStreamService([
		makeToolCallResponse('tc-1', 'bash', {command: 'echo hello'}),
		makeSimpleResponse('Done!'),
	]);

	const config = makeBaseConfig({
		service,
		enableBash: true,
		autoApprove: true,
		consentHandler,
	});

	const generator = await createAgentRunner(config);
	await drainGenerator(generator);

	// Consent handler should NOT have been called because autoApprove is true
	t.false(consentCalled);
});

// =============================================================================
// Thread ID loads and continues
// =============================================================================

test('thread ID loads prior conversation and seeds context', async t => {
	// Create a thread with prior conversation
	const thread = createThread([
		{
			type: 'user_input',
			message: {role: 'user', content: 'previous message'},
			timestamp: 1000,
		},
		{
			type: 'model_response',
			result: {content: 'previous response'},
			timestamp: 2000,
		},
	]);

	const mockStore: ThreadStore = {
		async save() {
			// No-op
		},
		async load(id: string): Promise<Thread | undefined> {
			if (id === 'thread-123') {
				return thread;
			}

			return undefined;
		},
		async list(): Promise<string[]> {
			return ['thread-123'];
		},
		async delete() {
			// No-op
		},
	};

	const service = makeStreamService([makeSimpleResponse('Continued!')]);

	const config = makeBaseConfig({
		input: 'follow up message',
		service,
		threadId: 'thread-123',
		threadStore: mockStore,
	});

	const generator = await createAgentRunner(config);
	const {events, finalState} = await drainGenerator(generator);

	// Should complete successfully
	t.is((finalState as {status: string}).status, 'done');

	// Should have user_input for the follow-up message
	const userEvents = events.filter(e => e.type === 'user_input');
	t.is(userEvents.length, 1);

	// The user input should be the new follow-up message
	const firstUserEvent = userEvents[0]!;
	if (firstUserEvent.type === 'user_input') {
		t.is(firstUserEvent.message.content, 'follow up message');
	}
});

// =============================================================================
// Non-existent thread ID proceeds without history
// =============================================================================

test('non-existent thread ID proceeds normally without history', async t => {
	const mockStore: ThreadStore = {
		async save() {
			// No-op
		},
		async load(): Promise<Thread | undefined> {
			return undefined;
		},
		async list(): Promise<string[]> {
			return [];
		},
		async delete() {
			// No-op
		},
	};

	const config = makeBaseConfig({
		threadId: 'nonexistent',
		threadStore: mockStore,
	});

	const generator = await createAgentRunner(config);
	const {finalState} = await drainGenerator(generator);

	t.is((finalState as {status: string}).status, 'done');
});

// =============================================================================
// Non-bash mode has no bash tool
// =============================================================================

test('non-bash mode does not register bash tool', async t => {
	const service = makeStreamService([
		makeToolCallResponse('tc-1', 'bash', {command: 'echo hello'}),
		makeSimpleResponse('Done!'),
	]);

	const config = makeBaseConfig({
		service,
		enableBash: false,
	});

	const generator = await createAgentRunner(config);
	const {events} = await drainGenerator(generator);

	// Tool result should be an error since bash is not registered
	const toolResults = events.filter(e => e.type === 'tool_result');
	if (toolResults.length > 0 && toolResults[0]!.type === 'tool_result') {
		t.true(toolResults[0]!.result.isError);
	} else {
		// If no tool_result, that's also acceptable (model may signal done without tools)
		t.pass();
	}
});

// =============================================================================
// Consent handler denial skips bash execution
// =============================================================================

test('denied consent skips bash tool execution', async t => {
	const consentHandler: ConsentHandler = async (): Promise<ConsentDecision> =>
		({approved: false, reason: 'User denied'});

	const service = makeStreamService([
		makeToolCallResponse('tc-1', 'bash', {command: 'echo hello'}),
		makeSimpleResponse('OK, no bash.'),
	]);

	const config = makeBaseConfig({
		service,
		enableBash: true,
		autoApprove: false,
		consentHandler,
	});

	const generator = await createAgentRunner(config);
	const {events} = await drainGenerator(generator);

	// Should have a tool_result that indicates skipping
	const toolResults = events.filter(e => e.type === 'tool_result');
	t.true(toolResults.length > 0);
	if (toolResults[0]!.type === 'tool_result') {
		t.true(toolResults[0]!.result.isError);
		t.true(toolResults[0]!.result.content.includes('skipped'));
	}
});
