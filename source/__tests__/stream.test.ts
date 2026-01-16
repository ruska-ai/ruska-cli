/**
 * Tests for stream types and request building
 * Covers R2: Thread ID support in StreamRequest
 */

import test from 'ava';
import {
	type StreamRequest,
	type StreamEvent,
	type MetadataPayload,
	isDistributedResponse,
	isDistributedError,
	STREAM_DONE_MARKER,
} from '../types/stream.js';

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

// Metadata event tests
test('parseStreamEvent parses metadata event correctly', t => {
	const data =
		'["metadata", {"thread_id": "thread-123", "assistant_id": "asst-456"}]';
	const event = parseStreamEvent(data);
	t.is(event?.type, 'metadata');
	/* eslint-disable @typescript-eslint/naming-convention */
	t.deepEqual(event?.payload, {
		thread_id: 'thread-123',
		assistant_id: 'asst-456',
	});
	/* eslint-enable @typescript-eslint/naming-convention */
});

test('MetadataPayload has correct structure with thread_id', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const metadata: MetadataPayload = {
		thread_id: 'thread-abc-123',
		assistant_id: 'asst-xyz',
		project_id: 'proj-456',
	};
	/* eslint-enable @typescript-eslint/naming-convention */

	t.is(metadata.thread_id, 'thread-abc-123');
	t.is(metadata.assistant_id, 'asst-xyz');
	t.is(metadata.project_id, 'proj-456');
});

test('MetadataPayload allows optional fields', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const metadata: MetadataPayload = {
		thread_id: 'thread-only',
	};
	/* eslint-enable @typescript-eslint/naming-convention */

	t.is(metadata.thread_id, 'thread-only');
	t.is(metadata.assistant_id, undefined);
	t.is(metadata.project_id, undefined);
});

test('MetadataPayload can be empty', t => {
	const metadata: MetadataPayload = {};

	t.is(metadata.thread_id, undefined);
	t.is(metadata.assistant_id, undefined);
	t.is(metadata.project_id, undefined);
});

/**
 * Test that thread_id from metadata event can be extracted for display
 * This validates the pattern used in chat.tsx for displaying thread info
 */
test('thread_id extraction pattern from metadata event', t => {
	const data = '["metadata", {"thread_id": "new-thread-from-server"}]';
	const event = parseStreamEvent(data);

	t.is(event?.type, 'metadata');

	// Simulate the pattern used in chat.tsx
	if (event?.type === 'metadata') {
		const {payload} = event;
		const threadId = payload.thread_id;
		t.is(threadId, 'new-thread-from-server');
	}
});

// =============================================================================
// Distributed Mode Tests (Issue #59)
// =============================================================================

// isDistributedResponse type guard tests
test('isDistributedResponse returns true for valid distributed response', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const response = {thread_id: 'abc-123', distributed: true};
	/* eslint-enable @typescript-eslint/naming-convention */
	t.true(isDistributedResponse(response));
});

test('isDistributedResponse returns false when distributed is not true', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const response = {thread_id: 'abc-123', distributed: false};
	/* eslint-enable @typescript-eslint/naming-convention */
	t.false(isDistributedResponse(response));
});

test('isDistributedResponse returns false when distributed is missing', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const response = {thread_id: 'abc-123'};
	/* eslint-enable @typescript-eslint/naming-convention */
	t.false(isDistributedResponse(response));
});

test('isDistributedResponse returns false when thread_id is missing', t => {
	const response = {distributed: true};
	t.false(isDistributedResponse(response));
});

test('isDistributedResponse returns false when thread_id is empty string', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const response = {thread_id: '', distributed: true};
	/* eslint-enable @typescript-eslint/naming-convention */
	t.false(isDistributedResponse(response));
});

test('isDistributedResponse returns false when thread_id exceeds 256 chars', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const response = {thread_id: 'a'.repeat(257), distributed: true};
	/* eslint-enable @typescript-eslint/naming-convention */
	t.false(isDistributedResponse(response));
});

test('isDistributedResponse returns true when thread_id is exactly 256 chars', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const response = {thread_id: 'a'.repeat(256), distributed: true};
	/* eslint-enable @typescript-eslint/naming-convention */
	t.true(isDistributedResponse(response));
});

test('isDistributedResponse returns false for null', t => {
	t.false(isDistributedResponse(null));
});

test('isDistributedResponse returns false for undefined', t => {
	t.false(isDistributedResponse(undefined));
});

test('isDistributedResponse returns false for non-object types', t => {
	t.false(isDistributedResponse('string'));
	t.false(isDistributedResponse(123));
	t.false(isDistributedResponse(true));
	t.false(isDistributedResponse([]));
});

test('isDistributedResponse returns false when thread_id is not a string', t => {
	/* eslint-disable @typescript-eslint/naming-convention */
	const response = {thread_id: 123, distributed: true};
	/* eslint-enable @typescript-eslint/naming-convention */
	t.false(isDistributedResponse(response));
});

// IsDistributedError type guard tests
test('isDistributedError returns true for valid error format', t => {
	const error = {error: 'Something went wrong'};
	t.true(isDistributedError(error));
});

test('isDistributedError returns false when error is missing', t => {
	const obj = {message: 'Something went wrong'};
	t.false(isDistributedError(obj));
});

test('isDistributedError returns false when error is not a string', t => {
	const obj = {error: 123};
	t.false(isDistributedError(obj));
});

test('isDistributedError returns false for null', t => {
	t.false(isDistributedError(null));
});

test('isDistributedError returns false for undefined', t => {
	t.false(isDistributedError(undefined));
});

test('isDistributedError returns true for empty error string', t => {
	const error = {error: ''};
	t.true(isDistributedError(error));
});

// STREAM_DONE_MARKER constant test
test('STREAM_DONE_MARKER is [DONE]', t => {
	t.is(STREAM_DONE_MARKER, '[DONE]');
});

// Distributed event parsing simulation
test('parseStreamEvent handles done event type', t => {
	// Simulating how done events would be added to StreamEvent array
	const doneEvent: StreamEvent = {type: 'done', payload: undefined};
	t.is(doneEvent.type, 'done');
	t.is(doneEvent.payload, undefined);
});

test('distributed error response can be converted to error event', t => {
	const distributedError = {error: 'Worker crashed'};

	if (isDistributedError(distributedError)) {
		const errorEvent: StreamEvent = {
			type: 'error',
			payload: {message: distributedError.error},
		};
		t.is(errorEvent.type, 'error');
		t.is(errorEvent.payload.message, 'Worker crashed');
	} else {
		t.fail('Should be recognized as distributed error');
	}
});
