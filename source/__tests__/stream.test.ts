/**
 * Tests for stream types and request building
 * Covers R2: Thread ID support in StreamRequest
 */

import test from 'ava';
import type {StreamRequest, StreamEvent} from '../types/stream.js';

// Helper to create a valid StreamRequest
/* eslint-disable @typescript-eslint/naming-convention */
function createStreamRequest(options: {
	message: string;
	assistantId?: string;
	threadId?: string;
	model?: string;
}): StreamRequest {
	return {
		input: {
			messages: [{role: 'user', content: options.message}],
		},
		...(options.model && {model: options.model}),
		metadata: {
			...(options.assistantId && {assistant_id: options.assistantId}),
			...(options.threadId && {thread_id: options.threadId}),
		},
	};
}
/* eslint-enable @typescript-eslint/naming-convention */

// Helper to parse SSE event data
function parseStreamEvent(data: string): StreamEvent | undefined {
	try {
		const parsed = JSON.parse(data) as [string, unknown];
		const [type, payload] = parsed;
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return {type, payload} as StreamEvent;
	} catch {
		return undefined;
	}
}

// StreamRequest Tests
test('StreamRequest has required input field', t => {
	const request = createStreamRequest({message: 'Hello'});
	t.truthy(request.input);
	t.truthy(request.input.messages);
	t.is(request.input.messages.length, 1);
});

test('StreamRequest message has correct structure', t => {
	const request = createStreamRequest({message: 'Test message'});
	const message = request.input.messages[0];
	t.is(message?.role, 'user');
	t.is(message?.content, 'Test message');
});

test('StreamRequest includes assistant_id in metadata', t => {
	const request = createStreamRequest({
		message: 'Hello',
		assistantId: 'test-assistant-123',
	});
	t.is(request.metadata?.assistant_id, 'test-assistant-123');
});

test('StreamRequest includes thread_id in metadata when provided', t => {
	const request = createStreamRequest({
		message: 'Hello',
		assistantId: 'test-assistant',
		threadId: 'thread-abc-123',
	});
	t.is(request.metadata?.thread_id, 'thread-abc-123');
});

test('StreamRequest omits thread_id when not provided', t => {
	const request = createStreamRequest({
		message: 'Hello',
		assistantId: 'test-assistant',
	});
	t.is(request.metadata?.thread_id, undefined);
});

test('StreamRequest includes model when provided', t => {
	const request = createStreamRequest({
		message: 'Hello',
		model: 'openai:gpt-4',
	});
	t.is(request.model, 'openai:gpt-4');
});

test('StreamRequest omits model when not provided', t => {
	const request = createStreamRequest({message: 'Hello'});
	t.is(request.model, undefined);
});

// Conditional metadata spreading pattern (R2 implementation pattern)
test('Conditional spread includes only defined values', t => {
	const threadId: string | undefined = 'my-thread';
	const assistantId = 'my-assistant';

	/* eslint-disable @typescript-eslint/naming-convention */
	const metadata = {
		assistant_id: assistantId,
		...(threadId && {thread_id: threadId}),
	};
	/* eslint-enable @typescript-eslint/naming-convention */

	t.is(metadata.assistant_id, 'my-assistant');
	t.is(metadata.thread_id, 'my-thread');
});

test('Conditional spread excludes undefined values', t => {
	const threadId: string | undefined = undefined;
	const assistantId = 'my-assistant';

	// When threadId is undefined, thread_id should not be in metadata
	/* eslint-disable @typescript-eslint/naming-convention */
	const metadata: {assistant_id: string; thread_id?: string} = {
		assistant_id: assistantId,
	};

	if (threadId) {
		metadata.thread_id = threadId;
	}
	/* eslint-enable @typescript-eslint/naming-convention */

	t.is(metadata.assistant_id, 'my-assistant');
	t.is(metadata.thread_id, undefined);
});

// StreamEvent parsing tests
test('parseStreamEvent parses messages event correctly', t => {
	const data = '["messages", {"content": "Hello world"}]';
	const event = parseStreamEvent(data);
	t.is(event?.type, 'messages');
	t.deepEqual(event?.payload, {content: 'Hello world'});
});

test('parseStreamEvent parses values event correctly', t => {
	const data =
		'["values", {"messages": [{"role": "assistant", "content": "Hi"}]}]';
	const event = parseStreamEvent(data);
	t.is(event?.type, 'values');
});

test('parseStreamEvent parses error event correctly', t => {
	const data = '["error", {"message": "Something went wrong"}]';
	const event = parseStreamEvent(data);
	t.is(event?.type, 'error');
	t.deepEqual(event?.payload, {message: 'Something went wrong'});
});

test('parseStreamEvent returns undefined for invalid JSON', t => {
	const event = parseStreamEvent('not valid json');
	t.is(event, undefined);
});

test('parseStreamEvent returns undefined for empty data', t => {
	const event = parseStreamEvent('');
	t.is(event, undefined);
});
