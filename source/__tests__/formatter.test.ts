/**
 * Tests for output formatter
 */

import test from 'ava';
import {OutputFormatter} from '../lib/output/formatter.js';

test('OutputFormatter initializes with empty accumulated content', t => {
	const formatter = new OutputFormatter();
	t.is(formatter.getAccumulated(), '');
});

test('chunk returns correct ChunkOutput structure', t => {
	const formatter = new OutputFormatter();
	const output = formatter.chunk('Hello');

	t.is(output.type, 'chunk');
	t.is(output.content, 'Hello');
});

test('chunk accumulates content', t => {
	const formatter = new OutputFormatter();

	formatter.chunk('Hello');
	formatter.chunk(' ');
	formatter.chunk('World');

	t.is(formatter.getAccumulated(), 'Hello World');
});

test('done returns correct DoneOutput structure', t => {
	const formatter = new OutputFormatter();
	const payload = {
		messages: [{role: 'assistant', content: 'Hi there!'}],
	};

	const output = formatter.done(payload);

	t.is(output.type, 'done');
	t.deepEqual(output.response, payload);
});

test('done includes full response payload', t => {
	const formatter = new OutputFormatter();
	const payload = {
		messages: [
			{role: 'user', content: 'Hello'},
			{role: 'assistant', content: 'Hi!'},
		],
		files: {},
		todos: [],
	};

	const output = formatter.done(payload);

	t.is(output.response.messages.length, 2);
	t.deepEqual(output.response.files, {});
	t.deepEqual(output.response.todos, []);
});

test('error returns correct ErrorOutput structure', t => {
	const formatter = new OutputFormatter();
	const output = formatter.error('AUTH_FAILED', 'Not authenticated');

	t.is(output.type, 'error');
	t.is(output.code, 'AUTH_FAILED');
	t.is(output.message, 'Not authenticated');
});

test('error handles all error codes', t => {
	const formatter = new OutputFormatter();
	const errorCodes = [
		'AUTH_FAILED',
		'RATE_LIMITED',
		'TIMEOUT',
		'NETWORK_ERROR',
		'SERVER_ERROR',
		'STREAM_INTERRUPTED',
	] as const;

	for (const code of errorCodes) {
		const output = formatter.error(code, `Error: ${code}`);
		t.is(output.code, code);
	}
});

test('formatter instances are independent', t => {
	const formatter1 = new OutputFormatter();
	const formatter2 = new OutputFormatter();

	formatter1.chunk('Hello');
	formatter2.chunk('World');

	t.is(formatter1.getAccumulated(), 'Hello');
	t.is(formatter2.getAccumulated(), 'World');
});

test('done works with empty messages array', t => {
	const formatter = new OutputFormatter();
	const output = formatter.done({messages: []});

	t.is(output.type, 'done');
	t.deepEqual(output.response.messages, []);
});
