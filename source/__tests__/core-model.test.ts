/**
 * Tests for Model Interface.
 * Covers US-011: Implement Model Interface
 */

import test from 'ava';
import type {StreamRequest, StreamHandle, StreamEvent} from '../types/stream.js';
import type {StreamServiceInterface} from '../lib/services/stream-service.interface.js';
import {type CoreMessage, type ToolDefinition} from '../core/schemas.js';
import {
	coreToStreamMessage,
	streamToolCallsToCoreToolCalls,
	createStreamModel,
} from '../core/model.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeStreamService(
	events: StreamEvent[],
): StreamServiceInterface & {lastRequest?: StreamRequest} {
	const svc: StreamServiceInterface & {lastRequest?: StreamRequest} = {
		async connect(request: StreamRequest): Promise<StreamHandle> {
			svc.lastRequest = request;
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
	return svc;
}

// =============================================================================
// coreToStreamMessage — conversion
// =============================================================================

test('coreToStreamMessage converts user message', t => {
	const core: CoreMessage = {role: 'user', content: 'hello'};
	const stream = coreToStreamMessage(core);
	t.deepEqual(stream, {role: 'user', content: 'hello'});
});

test('coreToStreamMessage converts system message', t => {
	const core: CoreMessage = {role: 'system', content: 'you are helpful'};
	const stream = coreToStreamMessage(core);
	t.deepEqual(stream, {role: 'system', content: 'you are helpful'});
});

test('coreToStreamMessage converts assistant message', t => {
	const core: CoreMessage = {role: 'assistant', content: 'sure'};
	const stream = coreToStreamMessage(core);
	t.deepEqual(stream, {role: 'assistant', content: 'sure'});
});

test('coreToStreamMessage converts tool message with toolCallId', t => {
	const core: CoreMessage = {
		role: 'tool',
		content: 'result data',
		toolCallId: 'tc-123',
	};
	const stream = coreToStreamMessage(core);
	// eslint-disable-next-line @typescript-eslint/naming-convention
	t.deepEqual(stream, {role: 'tool', tool_call_id: 'tc-123', content: 'result data'});
});

test('coreToStreamMessage converts tool message without toolCallId', t => {
	const core: CoreMessage = {role: 'tool', content: 'data'};
	const stream = coreToStreamMessage(core);
	// eslint-disable-next-line @typescript-eslint/naming-convention
	t.deepEqual(stream, {role: 'tool', tool_call_id: '', content: 'data'});
});

// =============================================================================
// streamToolCallsToCoreToolCalls — conversion
// =============================================================================

test('streamToolCallsToCoreToolCalls converts tool calls', t => {
	const streamCalls = [
		{id: 'tc-1', name: 'bash', args: {command: 'ls'}},
		{id: 'tc-2', name: 'echo', args: {message: 'hi'}},
	];
	const coreCalls = streamToolCallsToCoreToolCalls(streamCalls);
	t.is(coreCalls.length, 2);
	t.is(coreCalls[0]!.id, 'tc-1');
	t.is(coreCalls[0]!.name, 'bash');
	t.deepEqual(coreCalls[0]!.args, {command: 'ls'});
	t.is(coreCalls[1]!.id, 'tc-2');
});

test('streamToolCallsToCoreToolCalls handles empty array', t => {
	const coreCalls = streamToolCallsToCoreToolCalls([]);
	t.deepEqual(coreCalls, []);
});

// =============================================================================
// ModelInterface contract — createStreamModel
// =============================================================================

test('createStreamModel returns object with invoke method', t => {
	const svc = makeStreamService([]);
	const model = createStreamModel({service: svc});
	t.is(typeof model.invoke, 'function');
});

// =============================================================================
// invoke — basic text response
// =============================================================================

test('invoke collects text content from messages events', async t => {
	const events: StreamEvent[] = [
		{
			type: 'messages',
			payload: [{content: 'Hello '}],
		},
		{
			type: 'messages',
			payload: [{content: 'world'}],
		},
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	const messages: CoreMessage[] = [{role: 'user', content: 'hi'}];
	const result = await model.invoke(messages);

	t.is(result.content, 'Hello world');
	t.true(result.done);
});

// =============================================================================
// invoke — tool calls
// =============================================================================

test('invoke extracts tool calls from messages events', async t => {
	const events: StreamEvent[] = [
		{
			type: 'messages',
			payload: [{
				content: '',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				tool_calls: [{id: 'tc-1', name: 'bash', args: {command: 'ls'}}],
			}],
		},
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	const result = await model.invoke([{role: 'user', content: 'list files'}]);

	t.truthy(result.toolCalls);
	t.is(result.toolCalls!.length, 1);
	t.is(result.toolCalls![0]!.name, 'bash');
	t.deepEqual(result.toolCalls![0]!.args, {command: 'ls'});
});

// =============================================================================
// invoke — content blocks (multi-modal)
// =============================================================================

test('invoke extracts text from content blocks', async t => {
	const events: StreamEvent[] = [
		{
			type: 'messages',
			payload: [{
				content: [{text: 'block text', type: 'text'}],
			}],
		},
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	const result = await model.invoke([{role: 'user', content: 'test'}]);
	t.is(result.content, 'block text');
});

// =============================================================================
// invoke — error event
// =============================================================================

test('invoke throws on stream error event', async t => {
	const events: StreamEvent[] = [
		{type: 'error', payload: {message: 'model failed'}},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	await t.throwsAsync(
		async () => model.invoke([{role: 'user', content: 'test'}]),
		{message: 'Stream error: model failed'},
	);
});

// =============================================================================
// invoke — empty stream
// =============================================================================

test('invoke handles empty stream', async t => {
	const svc = makeStreamService([]);
	const model = createStreamModel({service: svc});

	const result = await model.invoke([{role: 'user', content: 'hello'}]);
	t.is(result.content, '');
});

// =============================================================================
// invoke — passes tools as name array
// =============================================================================

test('invoke passes tool names to stream service', async t => {
	const events: StreamEvent[] = [
		{type: 'messages', payload: [{content: 'ok'}]},
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	const tools: ToolDefinition[] = [
		{name: 'bash', description: 'Run commands', parameters: {}},
		{name: 'echo', description: 'Echo text', parameters: {}},
	];

	await model.invoke([{role: 'user', content: 'test'}], tools);

	t.truthy(svc.lastRequest);
	t.deepEqual(svc.lastRequest!.tools, ['bash', 'echo']);
});

// =============================================================================
// invoke — passes model and metadata config
// =============================================================================

test('invoke passes model and metadata from config', async t => {
	const events: StreamEvent[] = [
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({
		service: svc,
		model: 'gpt-4',
		assistantId: 'asst-1',
		threadId: 'thread-1',
	});

	await model.invoke([{role: 'user', content: 'hi'}]);

	t.truthy(svc.lastRequest);
	t.is(svc.lastRequest!.model, 'gpt-4');
	t.is(svc.lastRequest!.metadata?.assistant_id, 'asst-1');
	t.is(svc.lastRequest!.metadata?.thread_id, 'thread-1');
});

// =============================================================================
// invoke — converts CoreMessage array to StreamMessage array
// =============================================================================

test('invoke converts all message types for stream request', async t => {
	const events: StreamEvent[] = [
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	const messages: CoreMessage[] = [
		{role: 'system', content: 'be helpful'},
		{role: 'user', content: 'hello'},
		{role: 'assistant', content: 'hi there'},
		{role: 'tool', content: 'result', toolCallId: 'tc-99'},
	];

	await model.invoke(messages);

	t.truthy(svc.lastRequest);
	const sent = svc.lastRequest!.input.messages;
	t.is(sent.length, 4);
	t.deepEqual(sent[0], {role: 'system', content: 'be helpful'});
	t.deepEqual(sent[1], {role: 'user', content: 'hello'});
	t.deepEqual(sent[2], {role: 'assistant', content: 'hi there'});
	// eslint-disable-next-line @typescript-eslint/naming-convention
	t.deepEqual(sent[3], {role: 'tool', tool_call_id: 'tc-99', content: 'result'});
});

// =============================================================================
// invoke — result is validated via modelResultSchema
// =============================================================================

test('invoke result passes modelResultSchema validation', async t => {
	const events: StreamEvent[] = [
		{type: 'messages', payload: [{content: 'valid'}]},
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	const result = await model.invoke([{role: 'user', content: 'test'}]);
	t.is(typeof result.content, 'string');
	t.true(result.done);
});

// =============================================================================
// invoke — no tools means no tools in request
// =============================================================================

test('invoke without tools omits tools from request', async t => {
	const events: StreamEvent[] = [
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	await model.invoke([{role: 'user', content: 'test'}]);

	t.truthy(svc.lastRequest);
	t.is(svc.lastRequest!.tools, undefined);
});

// =============================================================================
// invoke — multiple tool calls across events
// =============================================================================

test('invoke accumulates tool calls across multiple message events', async t => {
	const events: StreamEvent[] = [
		{
			type: 'messages',
			payload: [{
				content: '',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				tool_calls: [{id: 'tc-1', name: 'bash', args: {command: 'ls'}}],
			}],
		},
		{
			type: 'messages',
			payload: [{
				content: '',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				tool_calls: [{id: 'tc-2', name: 'echo', args: {msg: 'hi'}}],
			}],
		},
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	const result = await model.invoke([{role: 'user', content: 'multi'}]);

	t.truthy(result.toolCalls);
	t.is(result.toolCalls!.length, 2);
	t.is(result.toolCalls![0]!.name, 'bash');
	t.is(result.toolCalls![1]!.name, 'echo');
});

// =============================================================================
// invoke — metadata/values events are skipped
// =============================================================================

test('invoke ignores metadata and values events', async t => {
	const events: StreamEvent[] = [
		// eslint-disable-next-line @typescript-eslint/naming-convention
		{type: 'metadata', payload: {thread_id: 'tid'}},
		{type: 'messages', payload: [{content: 'text'}]},
		{type: 'values', payload: {messages: []}},
		{type: 'done', payload: undefined},
	];

	const svc = makeStreamService(events);
	const model = createStreamModel({service: svc});

	const result = await model.invoke([{role: 'user', content: 'test'}]);
	t.is(result.content, 'text');
	t.true(result.done);
});
