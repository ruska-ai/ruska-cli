import test from 'ava';
import {type ChatMessage, type StreamRequest} from '../types/index.js';
import {
	createStreamRequest,
	parseStreamEvent,
	extractContentFromPayload,
} from '../lib/stream.js';

// =============================================================================
// Type Tests - Ensure types are correctly defined
// =============================================================================

test('ChatMessage type has correct structure', t => {
	const message: ChatMessage = {
		role: 'user',
		content: 'Hello, world!',
	};

	t.is(message.role, 'user');
	t.is(message.content, 'Hello, world!');
});

test('ChatMessage can have optional id', t => {
	const message: ChatMessage = {
		role: 'assistant',
		content: 'Hi there!',
		id: 'msg-123',
	};

	t.is(message.id, 'msg-123');
});

test('StreamRequest has required fields', t => {
	const request: StreamRequest = {
		input: {
			messages: [{role: 'user', content: 'Test'}],
		},
	};

	t.truthy(request.input);
	t.truthy(request.input.messages);
	t.is(request.input.messages.length, 1);
});

test('StreamRequest can have optional fields', t => {
	/* eslint-disable @typescript-eslint/naming-convention -- API requires snake_case */
	const request: StreamRequest = {
		input: {
			messages: [{role: 'user', content: 'Test'}],
		},
		model: 'openai:gpt-4o',
		system_prompt: 'You are helpful.',
		tools: ['web_search'],
		metadata: {
			assistant_id: 'asst-123',
			thread_id: 'thread-456',
		},
	};
	/* eslint-enable @typescript-eslint/naming-convention */

	t.is(request.model, 'openai:gpt-4o');
	t.is(request.system_prompt, 'You are helpful.');
	t.deepEqual(request.tools, ['web_search']);
	t.is(request.metadata?.assistant_id, 'asst-123');
});

// =============================================================================
// createStreamRequest Tests
// =============================================================================

test('createStreamRequest creates valid request with message only', t => {
	const request = createStreamRequest('Hello');

	t.deepEqual(request.input.messages, [{role: 'user', content: 'Hello'}]);
	t.is(request.model, undefined);
	t.is(request.system_prompt, undefined);
});

test('createStreamRequest includes model when provided', t => {
	const request = createStreamRequest('Hello', {model: 'openai:gpt-4o'});

	t.is(request.model, 'openai:gpt-4o');
});

test('createStreamRequest includes assistant_id in metadata', t => {
	const request = createStreamRequest('Hello', {assistantId: 'asst-123'});

	t.is(request.metadata?.assistant_id, 'asst-123');
});

test('createStreamRequest includes system_prompt', t => {
	const request = createStreamRequest('Hello', {
		systemPrompt: 'You are a helpful assistant.',
	});

	t.is(request.system_prompt, 'You are a helpful assistant.');
});

test('createStreamRequest includes tools array', t => {
	const request = createStreamRequest('Hello', {
		tools: ['web_search', 'calculator'],
	});

	t.deepEqual(request.tools, ['web_search', 'calculator']);
});

test('createStreamRequest with conversation history', t => {
	const history: ChatMessage[] = [
		{role: 'user', content: 'Hi'},
		{role: 'assistant', content: 'Hello!'},
	];
	const request = createStreamRequest('How are you?', {history});

	t.is(request.input.messages.length, 3);
	t.is(request.input.messages[0]?.content, 'Hi');
	t.is(request.input.messages[1]?.content, 'Hello!');
	t.is(request.input.messages[2]?.content, 'How are you?');
});

// =============================================================================
// parseStreamEvent Tests
// =============================================================================

test('parseStreamEvent parses messages event correctly', t => {
	const eventData = JSON.stringify([
		'messages',
		[{id: 'msg-1', content: 'Hello'}, {}],
	]);

	const result = parseStreamEvent(eventData);

	t.is(result.type, 'messages');
	t.truthy(result.data);
});

test('parseStreamEvent parses values event correctly', t => {
	const eventData = JSON.stringify(['values', {files: {}, todos: []}]);

	const result = parseStreamEvent(eventData);

	t.is(result.type, 'values');
});

test('parseStreamEvent parses error event correctly', t => {
	const eventData = JSON.stringify(['error', 'Something went wrong']);

	const result = parseStreamEvent(eventData);

	t.is(result.type, 'error');
	t.is(result.error, 'Something went wrong');
});

test('parseStreamEvent handles invalid JSON gracefully', t => {
	const result = parseStreamEvent('not valid json');

	t.is(result.type, 'error');
	t.truthy(result.error);
});

test('parseStreamEvent handles empty data', t => {
	const result = parseStreamEvent('');

	t.is(result.type, 'error');
});

// =============================================================================
// extractContentFromPayload Tests
// =============================================================================

test('extractContentFromPayload extracts string content', t => {
	const payload = {content: 'Hello, world!'};

	const content = extractContentFromPayload(payload);

	t.is(content, 'Hello, world!');
});

test('extractContentFromPayload extracts content from array format', t => {
	const payload = {
		content: [{type: 'text', text: 'Hello from array'}],
	};

	const content = extractContentFromPayload(payload);

	t.is(content, 'Hello from array');
});

test('extractContentFromPayload returns empty string for missing content', t => {
	const payload = {};

	const content = extractContentFromPayload(payload);

	t.is(content, '');
});

test('extractContentFromPayload handles null payload', t => {
	const content = extractContentFromPayload(null);

	t.is(content, '');
});

test('extractContentFromPayload handles undefined payload', t => {
	const content = extractContentFromPayload(undefined);

	t.is(content, '');
});
