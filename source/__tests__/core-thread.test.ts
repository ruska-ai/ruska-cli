/**
 * Tests for Thread / Event Log.
 * Covers US-006: Implement Thread / Event Log
 */

import test from 'ava';
import {type AgentEvent} from '../core/schemas.js';
import {createThread, deserializeThread} from '../core/thread.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const userInputEvent: AgentEvent = {
	type: 'user_input',
	message: {role: 'user', content: 'hello'},
	timestamp: 1000,
};

const modelResponseEvent: AgentEvent = {
	type: 'model_response',
	result: {content: 'hi there', done: false},
	timestamp: 2000,
};

const toolCallEvent: AgentEvent = {
	type: 'tool_call',
	toolCall: {id: 'tc-1', name: 'bash', args: {command: 'ls'}},
	timestamp: 3000,
};

const toolResultEvent: AgentEvent = {
	type: 'tool_result',
	result: {toolCallId: 'tc-1', content: 'file.txt'},
	timestamp: 4000,
};

const errorEvent: AgentEvent = {
	type: 'error',
	error: {
		message: 'oops',
		attempt: 1,
		maxAttempts: 3,
		recoverable: true,
		timestamp: 5000,
	},
	timestamp: 5000,
};

const doneEvent: AgentEvent = {
	type: 'done',
	reason: 'task complete',
	timestamp: 6000,
};

// =============================================================================
// createThread — basic operations
// =============================================================================

test('createThread returns empty thread', t => {
	const thread = createThread();
	t.is(thread.length, 0);
	t.deepEqual(thread.events(), []);
});

test('createThread with initial events', t => {
	const thread = createThread([userInputEvent, modelResponseEvent]);
	t.is(thread.length, 2);
	t.deepEqual(thread.events(), [userInputEvent, modelResponseEvent]);
});

// =============================================================================
// append
// =============================================================================

test('append adds events to the log', t => {
	const thread = createThread();
	thread.append(userInputEvent);
	t.is(thread.length, 1);
	thread.append(modelResponseEvent);
	t.is(thread.length, 2);
	t.deepEqual(thread.events(), [userInputEvent, modelResponseEvent]);
});

test('append validates events via AgentEventSchema', t => {
	const thread = createThread();
	t.throws(() => {
		thread.append({type: 'invalid_type'} as unknown as AgentEvent);
	});
});

test('append validates initial events', t => {
	t.throws(() => {
		createThread([{type: 'bogus'} as unknown as AgentEvent]);
	});
});

// =============================================================================
// events — immutability
// =============================================================================

test('events() returns a copy (mutations do not affect log)', t => {
	const thread = createThread([userInputEvent]);
	const snapshot = thread.events();
	snapshot.pop();
	t.is(thread.length, 1, 'original log should be unmodified');
});

// =============================================================================
// eventsOfType
// =============================================================================

test('eventsOfType filters by discriminator', t => {
	const thread = createThread([
		userInputEvent,
		modelResponseEvent,
		toolCallEvent,
		toolResultEvent,
		errorEvent,
		doneEvent,
	]);

	const userInputs = thread.eventsOfType('user_input');
	t.is(userInputs.length, 1);
	const firstInput = userInputs[0]!;
	t.is(firstInput.type, 'user_input');
	t.is(firstInput.message.content, 'hello');

	const toolCalls = thread.eventsOfType('tool_call');
	t.is(toolCalls.length, 1);
	t.is(toolCalls[0]!.toolCall.name, 'bash');

	const errors = thread.eventsOfType('error');
	t.is(errors.length, 1);
	t.is(errors[0]!.error.message, 'oops');
});

test('eventsOfType returns empty array when no matches', t => {
	const thread = createThread([userInputEvent]);
	const results = thread.eventsOfType('done');
	t.deepEqual(results, []);
});

test('eventsOfType returns multiple events of same type', t => {
	const secondInput: AgentEvent = {
		type: 'user_input',
		message: {role: 'user', content: 'follow up'},
		timestamp: 7000,
	};

	const thread = createThread([
		userInputEvent,
		modelResponseEvent,
		secondInput,
	]);
	const userInputs = thread.eventsOfType('user_input');
	t.is(userInputs.length, 2);
	t.is(userInputs[0]!.message.content, 'hello');
	t.is(userInputs[1]!.message.content, 'follow up');
});

// =============================================================================
// length
// =============================================================================

test('length reflects current event count', t => {
	const thread = createThread();
	t.is(thread.length, 0);
	thread.append(userInputEvent);
	t.is(thread.length, 1);
	thread.append(modelResponseEvent);
	t.is(thread.length, 2);
	thread.append(toolCallEvent);
	t.is(thread.length, 3);
});

// =============================================================================
// serialize / deserializeThread — roundtrip
// =============================================================================

test('serialize produces valid JSON', t => {
	const thread = createThread([userInputEvent, modelResponseEvent]);
	const json = thread.serialize();
	const parsed: unknown = JSON.parse(json);
	t.true(Array.isArray(parsed));
});

test('serialize / deserializeThread roundtrip is lossless', t => {
	const allEvents: AgentEvent[] = [
		userInputEvent,
		modelResponseEvent,
		toolCallEvent,
		toolResultEvent,
		errorEvent,
		doneEvent,
	];

	const thread = createThread(allEvents);
	const json = thread.serialize();
	const restored = deserializeThread(json);

	t.is(restored.length, allEvents.length);
	t.deepEqual(restored.events(), allEvents);
});

test('deserializeThread re-validates events', t => {
	const badJson = JSON.stringify([{type: 'invalid'}]);
	t.throws(() => {
		deserializeThread(badJson);
	});
});

test('deserializeThread rejects non-array JSON', t => {
	t.throws(
		() => {
			deserializeThread('{"not": "an array"}');
		},
		{instanceOf: TypeError, message: 'Expected an array of events'},
	);
});

test('deserializeThread rejects invalid JSON', t => {
	t.throws(() => {
		deserializeThread('not json at all');
	});
});

test('deserialized thread supports further appends', t => {
	const thread = createThread([userInputEvent]);
	const json = thread.serialize();
	const restored = deserializeThread(json);

	restored.append(modelResponseEvent);
	t.is(restored.length, 2);
	t.deepEqual(restored.events(), [userInputEvent, modelResponseEvent]);
});

// =============================================================================
// serialize empty thread
// =============================================================================

test('empty thread serializes to empty array', t => {
	const thread = createThread();
	t.is(thread.serialize(), '[]');
});

test('empty thread roundtrips correctly', t => {
	const thread = createThread();
	const restored = deserializeThread(thread.serialize());
	t.is(restored.length, 0);
	t.deepEqual(restored.events(), []);
});
