/**
 * Tests for Human Contact Tool.
 * Covers US-010: Implement Human Contact Tool
 */

import test from 'ava';
import {
	humanContactToolDefinition,
	parseHumanContactArgs,
	type HumanContactHandler,
} from '../core/human.js';

// ---------------------------------------------------------------------------
// humanContactToolDefinition — shape
// ---------------------------------------------------------------------------

test('humanContactToolDefinition has correct name', t => {
	t.is(humanContactToolDefinition.name, 'contact_human');
});

test('humanContactToolDefinition has a description', t => {
	t.is(typeof humanContactToolDefinition.description, 'string');
	t.true(humanContactToolDefinition.description.length > 0);
});

test('humanContactToolDefinition has message parameter (required)', t => {
	const param = humanContactToolDefinition.parameters['message'];
	t.truthy(param);
	t.is(param!.type, 'string');
	t.is(param!.required, true);
});

test('humanContactToolDefinition has context parameter (optional)', t => {
	const param = humanContactToolDefinition.parameters['context'];
	t.truthy(param);
	t.is(param!.type, 'string');
	t.not(param!.required, true);
});

test('humanContactToolDefinition has urgency parameter (optional)', t => {
	const param = humanContactToolDefinition.parameters['urgency'];
	t.truthy(param);
	t.is(param!.type, 'string');
	t.not(param!.required, true);
});

// ---------------------------------------------------------------------------
// parseHumanContactArgs — valid input
// ---------------------------------------------------------------------------

test('parseHumanContactArgs with message only', t => {
	const result = parseHumanContactArgs({message: 'Need help with deployment'});
	t.is(result.message, 'Need help with deployment');
	t.is(result.context, undefined);
	t.is(result.urgency, undefined);
});

test('parseHumanContactArgs with all fields', t => {
	const result = parseHumanContactArgs({
		message: 'Approval needed',
		context: 'Production deployment pending',
		urgency: 'high',
	});
	t.is(result.message, 'Approval needed');
	t.is(result.context, 'Production deployment pending');
	t.is(result.urgency, 'high');
});

test('parseHumanContactArgs with each urgency level', t => {
	const levels = ['low', 'medium', 'high'] as const;
	for (const level of levels) {
		const result = parseHumanContactArgs({message: 'test', urgency: level});
		t.is(result.urgency, level);
	}
});

test('parseHumanContactArgs with context but no urgency', t => {
	const result = parseHumanContactArgs({
		message: 'Question',
		context: 'Some context here',
	});
	t.is(result.message, 'Question');
	t.is(result.context, 'Some context here');
	t.is(result.urgency, undefined);
});

// ---------------------------------------------------------------------------
// parseHumanContactArgs — invalid input
// ---------------------------------------------------------------------------

test('parseHumanContactArgs rejects missing message', t => {
	t.throws(() => parseHumanContactArgs({}), {
		message: /message/i,
	});
});

test('parseHumanContactArgs rejects non-string message', t => {
	t.throws(() => parseHumanContactArgs({message: 123}));
});

test('parseHumanContactArgs rejects invalid urgency value', t => {
	t.throws(() => parseHumanContactArgs({message: 'test', urgency: 'critical'}));
});

test('parseHumanContactArgs rejects non-string context', t => {
	t.throws(() => parseHumanContactArgs({message: 'test', context: 42}));
});

// ---------------------------------------------------------------------------
// HumanContactHandler — type check
// ---------------------------------------------------------------------------

test('HumanContactHandler type is compatible with async functions', t => {
	const handler: HumanContactHandler = async request => {
		return `Received: ${request.message}`;
	};

	t.is(typeof handler, 'function');
});

test('HumanContactHandler returns a promise', async t => {
	const handler: HumanContactHandler = async request => {
		return `Response to: ${request.message}`;
	};

	const result = await handler({message: 'Hello'});
	t.is(result, 'Response to: Hello');
});
