import test from 'ava';
import {buildContext, estimateTokens} from '../core/context.js';
import {type AgentEvent, type CoreMessage} from '../core/schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = Date.now();

function makeUserInput(content: string): AgentEvent {
	const event: AgentEvent = {
		type: 'user_input',
		message: {role: 'user', content},
		timestamp: now,
	};
	return event;
}

function makeModelResponse(content: string): AgentEvent {
	const event: AgentEvent = {
		type: 'model_response',
		result: {content},
		timestamp: now,
	};
	return event;
}

function makeToolResult(toolCallId: string, content: string): AgentEvent {
	const event: AgentEvent = {
		type: 'tool_result',
		result: {toolCallId, content},
		timestamp: now,
	};
	return event;
}

function makeErrorEvent(
	message: string,
	attempt: number,
	maxAttempts: number,
): AgentEvent {
	const event: AgentEvent = {
		type: 'error',
		error: {
			message,
			attempt,
			maxAttempts,
			recoverable: attempt < maxAttempts,
			timestamp: now,
		},
		timestamp: now,
	};
	return event;
}

function makeToolCallEvent(id: string, name: string): AgentEvent {
	const event: AgentEvent = {
		type: 'tool_call',
		toolCall: {id, name, args: {}},
		timestamp: now,
	};
	return event;
}

function makeDoneEvent(reason: string): AgentEvent {
	const event: AgentEvent = {
		type: 'done',
		reason,
		timestamp: now,
	};
	return event;
}

// ---------------------------------------------------------------------------
// buildContext — empty events
// ---------------------------------------------------------------------------

test('buildContext: returns empty array for no events', t => {
	const result = buildContext([]);
	t.deepEqual(result, []);
});

test('buildContext: returns only system message for no events with systemPrompt', t => {
	const result = buildContext([], {systemPrompt: 'You are helpful.'});
	t.is(result.length, 1);
	t.is(result[0]!.role, 'system');
	t.is(result[0]!.content, 'You are helpful.');
});

// ---------------------------------------------------------------------------
// buildContext — system prompt prepend
// ---------------------------------------------------------------------------

test('buildContext: prepends system prompt as first message', t => {
	const events = [makeUserInput('hello')];
	const result = buildContext(events, {systemPrompt: 'Be concise.'});
	t.is(result.length, 2);
	t.is(result[0]!.role, 'system');
	t.is(result[0]!.content, 'Be concise.');
	t.is(result[1]!.role, 'user');
	t.is(result[1]!.content, 'hello');
});

// ---------------------------------------------------------------------------
// buildContext — message extraction from events
// ---------------------------------------------------------------------------

test('buildContext: extracts user_input as user message', t => {
	const result = buildContext([makeUserInput('hi')]);
	t.is(result.length, 1);
	t.is(result[0]!.role, 'user');
	t.is(result[0]!.content, 'hi');
});

test('buildContext: extracts model_response as assistant message', t => {
	const result = buildContext([makeModelResponse('I can help')]);
	t.is(result.length, 1);
	t.is(result[0]!.role, 'assistant');
	t.is(result[0]!.content, 'I can help');
});

test('buildContext: extracts tool_result as tool message with toolCallId', t => {
	const result = buildContext([makeToolResult('call-1', 'success')]);
	t.is(result.length, 1);
	t.is(result[0]!.role, 'tool');
	t.is(result[0]!.content, 'success');
	t.is(result[0]!.toolCallId, 'call-1');
});

test('buildContext: formats error events into user-role context', t => {
	const result = buildContext([makeErrorEvent('timeout', 1, 3)]);
	t.is(result.length, 1);
	t.is(result[0]!.role, 'user');
	t.true(result[0]!.content.includes('[Agent Error]'));
	t.true(result[0]!.content.includes('timeout'));
});

test('buildContext: ignores tool_call events (no message contribution)', t => {
	const result = buildContext([makeToolCallEvent('tc-1', 'bash')]);
	t.deepEqual(result, []);
});

test('buildContext: ignores done events (no message contribution)', t => {
	const result = buildContext([makeDoneEvent('completed')]);
	t.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// buildContext — mixed event sequence
// ---------------------------------------------------------------------------

test('buildContext: reconstructs conversation from mixed events', t => {
	const events: AgentEvent[] = [
		makeUserInput('run ls'),
		makeModelResponse('I will run ls for you.'),
		makeToolCallEvent('tc-1', 'bash'),
		makeToolResult('tc-1', 'file1.txt\nfile2.txt'),
		makeModelResponse('Here are your files: file1.txt, file2.txt'),
	];
	const result = buildContext(events);
	t.is(result.length, 4); // User, assistant, tool, assistant (tool_call ignored)
	t.is(result[0]!.role, 'user');
	t.is(result[1]!.role, 'assistant');
	t.is(result[2]!.role, 'tool');
	t.is(result[3]!.role, 'assistant');
});

// ---------------------------------------------------------------------------
// buildContext — windowing (maxMessages)
// ---------------------------------------------------------------------------

test('buildContext: maxMessages applies tail windowing', t => {
	const events = [
		makeUserInput('first'),
		makeModelResponse('reply-1'),
		makeUserInput('second'),
		makeModelResponse('reply-2'),
		makeUserInput('third'),
		makeModelResponse('reply-3'),
	];
	const result = buildContext(events, {maxMessages: 2});
	t.is(result.length, 2);
	t.is(result[0]!.content, 'third');
	t.is(result[1]!.content, 'reply-3');
});

test('buildContext: maxMessages with systemPrompt preserves system + tail', t => {
	const events = [
		makeUserInput('first'),
		makeModelResponse('reply-1'),
		makeUserInput('second'),
		makeModelResponse('reply-2'),
	];
	const result = buildContext(events, {
		systemPrompt: 'system',
		maxMessages: 2,
	});
	// System + last 2 messages
	t.is(result.length, 3);
	t.is(result[0]!.role, 'system');
	t.is(result[0]!.content, 'system');
	t.is(result[1]!.content, 'second');
	t.is(result[2]!.content, 'reply-2');
});

test('buildContext: maxMessages larger than message count returns all', t => {
	const events = [makeUserInput('only')];
	const result = buildContext(events, {maxMessages: 100});
	t.is(result.length, 1);
	t.is(result[0]!.content, 'only');
});

// ---------------------------------------------------------------------------
// buildContext — error context for self-healing
// ---------------------------------------------------------------------------

test('buildContext: error events include formatted error details', t => {
	const events = [
		makeUserInput('do something'),
		makeErrorEvent('connection refused', 1, 3),
	];
	const result = buildContext(events);
	t.is(result.length, 2);
	t.is(result[1]!.role, 'user');
	t.true(result[1]!.content.includes('connection refused'));
	t.true(result[1]!.content.includes('Attempt 1/3'));
	t.true(result[1]!.content.includes('Recoverable'));
});

test('buildContext: fatal error is included in context', t => {
	const result = buildContext([makeErrorEvent('fatal', 3, 3)]);
	t.is(result[0]!.role, 'user');
	t.true(result[0]!.content.includes('Fatal'));
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

test('estimateTokens: returns 0 for empty messages', t => {
	t.is(estimateTokens([]), 0);
});

test('estimateTokens: estimates tokens for single message', t => {
	const messages: CoreMessage[] = [{role: 'user', content: 'hello world'}];
	const tokens = estimateTokens(messages);
	t.true(tokens > 0);
	// "hello world" (11) + "user" (4) + 10 overhead = 25 chars / 4 ≈ 7
	t.true(tokens < 100);
});

test('estimateTokens: increases with more messages', t => {
	const one: CoreMessage[] = [{role: 'user', content: 'hello'}];
	const two: CoreMessage[] = [
		{role: 'user', content: 'hello'},
		{role: 'assistant', content: 'world'},
	];
	t.true(estimateTokens(two) > estimateTokens(one));
});

test('estimateTokens: accounts for name and toolCallId', t => {
	const withoutExtras: CoreMessage[] = [{role: 'tool', content: 'result'}];
	const withExtras: CoreMessage[] = [
		{role: 'tool', content: 'result', name: 'bash', toolCallId: 'call-123'},
	];
	t.true(estimateTokens(withExtras) > estimateTokens(withoutExtras));
});

test('estimateTokens: returns integer', t => {
	const messages: CoreMessage[] = [{role: 'user', content: 'a'}];
	const tokens = estimateTokens(messages);
	t.is(tokens, Math.ceil(tokens));
});
