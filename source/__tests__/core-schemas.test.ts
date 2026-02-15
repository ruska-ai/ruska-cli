/**
 * Tests for core schemas and validation helpers.
 * Covers US-002: Define Core Schemas & Types
 */

import test from 'ava';
import {
	coreMessageSchema,
	toolCallSchema,
	modelResultSchema,
	promptTemplateSchema,
	toolParameterSchemaSchema,
	toolDefinitionSchema,
	toolResultSchema,
	humanContactRequestSchema,
	compactErrorSchema,
	agentEventSchema,
	agentStateSchema,
	agentConfigSchema,
	agentActionSchema,
	validateCoreMessage,
	safeValidateCoreMessage,
	validateToolCall,
	safeValidateToolCall,
	validateAgentEvent,
	safeValidateAgentEvent,
	validateAgentConfig,
	safeValidateAgentConfig,
} from '../core/schemas.js';

// =============================================================================
// CoreMessage
// =============================================================================

test('CoreMessage parses valid user message', t => {
	const msg = coreMessageSchema.parse({role: 'user', content: 'hello'});
	t.is(msg.role, 'user');
	t.is(msg.content, 'hello');
});

test('CoreMessage supports all four roles', t => {
	for (const role of ['system', 'user', 'assistant', 'tool'] as const) {
		const msg = coreMessageSchema.parse({role, content: 'test'});
		t.is(msg.role, role);
	}
});

test('CoreMessage rejects invalid role', t => {
	const result = coreMessageSchema.safeParse({
		role: 'invalid',
		content: 'test',
	});
	t.false(result.success);
});

test('CoreMessage rejects missing content', t => {
	const result = coreMessageSchema.safeParse({role: 'user'});
	t.false(result.success);
});

test('CoreMessage accepts optional name and toolCallId', t => {
	const msg = coreMessageSchema.parse({
		role: 'tool',
		content: 'result',
		name: 'bash',
		toolCallId: 'tc-1',
	});
	t.is(msg.name, 'bash');
	t.is(msg.toolCallId, 'tc-1');
});

// =============================================================================
// ToolCall
// =============================================================================

test('ToolCall parses valid data', t => {
	const tc = toolCallSchema.parse({
		id: 'tc-1',
		name: 'bash',
		args: {command: 'ls'},
	});
	t.is(tc.id, 'tc-1');
	t.is(tc.name, 'bash');
	t.deepEqual(tc.args, {command: 'ls'});
});

test('ToolCall rejects missing id', t => {
	const result = toolCallSchema.safeParse({name: 'bash', args: {}});
	t.false(result.success);
});

// =============================================================================
// ModelResult
// =============================================================================

test('ModelResult parses minimal result', t => {
	const mr = modelResultSchema.parse({content: 'Hello!'});
	t.is(mr.content, 'Hello!');
	t.is(mr.toolCalls, undefined);
	t.is(mr.done, undefined);
});

test('ModelResult parses with toolCalls', t => {
	const mr = modelResultSchema.parse({
		content: '',
		toolCalls: [{id: 'tc-1', name: 'bash', args: {command: 'pwd'}}],
		done: false,
	});
	t.is(mr.toolCalls!.length, 1);
	t.is(mr.toolCalls![0]!.name, 'bash');
});

// =============================================================================
// PromptTemplate
// =============================================================================

test('PromptTemplate parses valid template', t => {
	const pt = promptTemplateSchema.parse({
		name: 'greeting',
		version: '1.0',
		template: 'Hello {{name}}!',
		variables: ['name'],
	});
	t.is(pt.name, 'greeting');
	t.deepEqual(pt.variables, ['name']);
});

// =============================================================================
// ToolParameterSchema
// =============================================================================

test('ToolParameterSchema parses valid parameter', t => {
	const tps = toolParameterSchemaSchema.parse({
		type: 'string',
		description: 'The command to run',
		required: true,
	});
	t.is(tps.type, 'string');
	t.true(tps.required);
});

// =============================================================================
// ToolDefinition
// =============================================================================

test('ToolDefinition parses valid definition', t => {
	const td = toolDefinitionSchema.parse({
		name: 'bash',
		description: 'Run a bash command',
		parameters: {
			command: {type: 'string', description: 'The command', required: true},
		},
	});
	t.is(td.name, 'bash');
	t.truthy(td.parameters['command']);
});

test('ToolDefinition rejects missing name', t => {
	const result = toolDefinitionSchema.safeParse({
		description: 'no name',
		parameters: {},
	});
	t.false(result.success);
});

// =============================================================================
// ToolResult
// =============================================================================

test('ToolResult parses valid result', t => {
	const tr = toolResultSchema.parse({
		toolCallId: 'tc-1',
		content: 'success',
	});
	t.is(tr.toolCallId, 'tc-1');
	t.is(tr.isError, undefined);
});

test('ToolResult parses error result', t => {
	const tr = toolResultSchema.parse({
		toolCallId: 'tc-2',
		content: 'command failed',
		isError: true,
	});
	t.true(tr.isError);
});

// =============================================================================
// HumanContactRequest
// =============================================================================

test('HumanContactRequest parses minimal request', t => {
	const hcr = humanContactRequestSchema.parse({message: 'Need help'});
	t.is(hcr.message, 'Need help');
	t.is(hcr.urgency, undefined);
});

test('HumanContactRequest parses with optional fields', t => {
	const hcr = humanContactRequestSchema.parse({
		message: 'Need help',
		context: 'deploying v2',
		urgency: 'high',
	});
	t.is(hcr.urgency, 'high');
	t.is(hcr.context, 'deploying v2');
});

test('HumanContactRequest rejects invalid urgency', t => {
	const result = humanContactRequestSchema.safeParse({
		message: 'Help',
		urgency: 'critical',
	});
	t.false(result.success);
});

// =============================================================================
// CompactError
// =============================================================================

test('CompactError parses valid error', t => {
	const ce = compactErrorSchema.parse({
		message: 'Something failed',
		attempt: 1,
		maxAttempts: 3,
		recoverable: true,
		timestamp: Date.now(),
	});
	t.is(ce.message, 'Something failed');
	t.true(ce.recoverable);
});

test('CompactError accepts optional code', t => {
	const ce = compactErrorSchema.parse({
		message: 'fail',
		code: 'TIMEOUT',
		attempt: 2,
		maxAttempts: 3,
		recoverable: false,
		timestamp: 1234,
	});
	t.is(ce.code, 'TIMEOUT');
});

// =============================================================================
// AgentEvent — discriminated union
// =============================================================================

test('AgentEvent parses user_input event', t => {
	const evt = agentEventSchema.parse({
		type: 'user_input',
		message: {role: 'user', content: 'hello'},
		timestamp: Date.now(),
	});
	t.is(evt.type, 'user_input');
});

test('AgentEvent parses model_response event', t => {
	const evt = agentEventSchema.parse({
		type: 'model_response',
		result: {content: 'Hi there'},
		timestamp: Date.now(),
	});
	t.is(evt.type, 'model_response');
});

test('AgentEvent parses tool_call event', t => {
	const evt = agentEventSchema.parse({
		type: 'tool_call',
		toolCall: {id: 'tc-1', name: 'bash', args: {}},
		timestamp: Date.now(),
	});
	t.is(evt.type, 'tool_call');
});

test('AgentEvent parses tool_result event', t => {
	const evt = agentEventSchema.parse({
		type: 'tool_result',
		result: {toolCallId: 'tc-1', content: 'ok'},
		timestamp: Date.now(),
	});
	t.is(evt.type, 'tool_result');
});

test('AgentEvent parses error event', t => {
	const evt = agentEventSchema.parse({
		type: 'error',
		error: {
			message: 'fail',
			attempt: 1,
			maxAttempts: 3,
			recoverable: true,
			timestamp: Date.now(),
		},
		timestamp: Date.now(),
	});
	t.is(evt.type, 'error');
});

test('AgentEvent parses human_contact event', t => {
	const evt = agentEventSchema.parse({
		type: 'human_contact',
		request: {message: 'Please help'},
		timestamp: Date.now(),
	});
	t.is(evt.type, 'human_contact');
});

test('AgentEvent parses done event', t => {
	const evt = agentEventSchema.parse({
		type: 'done',
		reason: 'Task complete',
		timestamp: Date.now(),
	});
	t.is(evt.type, 'done');
});

test('AgentEvent rejects unknown event type', t => {
	const result = agentEventSchema.safeParse({
		type: 'unknown_type',
		data: {},
		timestamp: Date.now(),
	});
	t.false(result.success);
});

test('AgentEvent discriminated union provides descriptive error', t => {
	const result = agentEventSchema.safeParse({
		type: 'user_input',
		timestamp: Date.now(),
		// Missing 'message' field
	});
	t.false(result.success);
	if (!result.success) {
		t.truthy(result.error);
	}
});

// =============================================================================
// AgentState
// =============================================================================

test('AgentState parses valid state', t => {
	const state = agentStateSchema.parse({
		status: 'idle',
		events: [],
		iterations: 0,
		errorCount: 0,
	});
	t.is(state.status, 'idle');
	t.is(state.events.length, 0);
});

test('AgentState rejects invalid status', t => {
	const result = agentStateSchema.safeParse({
		status: 'invalid',
		events: [],
		iterations: 0,
		errorCount: 0,
	});
	t.false(result.success);
});

// =============================================================================
// AgentConfig
// =============================================================================

test('AgentConfig parses valid config', t => {
	const config = agentConfigSchema.parse({
		systemPrompt: 'You are helpful',
		maxIterations: 10,
		maxErrors: 3,
	});
	t.is(config.systemPrompt, 'You are helpful');
	t.is(config.maxIterations, 10);
});

test('AgentConfig rejects non-positive maxIterations', t => {
	const result = agentConfigSchema.safeParse({
		systemPrompt: 'test',
		maxIterations: 0,
		maxErrors: 3,
	});
	t.false(result.success);
});

test('AgentConfig rejects negative maxErrors', t => {
	const result = agentConfigSchema.safeParse({
		systemPrompt: 'test',
		maxIterations: 10,
		maxErrors: -1,
	});
	t.false(result.success);
});

// =============================================================================
// AgentAction
// =============================================================================

test('AgentAction parses call_model action', t => {
	const action = agentActionSchema.parse({type: 'call_model'});
	t.is(action.type, 'call_model');
});

test('AgentAction parses execute_tool action with toolCall', t => {
	const action = agentActionSchema.parse({
		type: 'execute_tool',
		toolCall: {id: 'tc-1', name: 'bash', args: {command: 'ls'}},
	});
	t.is(action.type, 'execute_tool');
	t.is(action.toolCall!.name, 'bash');
});

// =============================================================================
// Validate helpers (strict)
// =============================================================================

test('validateCoreMessage returns valid data', t => {
	const msg = validateCoreMessage({role: 'user', content: 'test'});
	t.is(msg.role, 'user');
});

test('validateCoreMessage throws on invalid data', t => {
	t.throws(() => {
		validateCoreMessage({role: 'bad'});
	});
});

test('validateToolCall returns valid data', t => {
	const tc = validateToolCall({id: '1', name: 'foo', args: {}});
	t.is(tc.name, 'foo');
});

test('validateAgentEvent returns valid event', t => {
	const evt = validateAgentEvent({
		type: 'done',
		reason: 'finished',
		timestamp: 1234,
	});
	t.is(evt.type, 'done');
});

test('validateAgentConfig returns valid config', t => {
	const cfg = validateAgentConfig({
		systemPrompt: 'prompt',
		maxIterations: 5,
		maxErrors: 2,
	});
	t.is(cfg.maxIterations, 5);
});

// =============================================================================
// SafeValidate helpers
// =============================================================================

test('safeValidateCoreMessage returns success for valid data', t => {
	const result = safeValidateCoreMessage({role: 'user', content: 'hi'});
	t.true(result.success);
	if (result.success) {
		t.is(result.data.role, 'user');
	}
});

test('safeValidateCoreMessage returns failure for invalid data', t => {
	const result = safeValidateCoreMessage({role: 'bad'});
	t.false(result.success);
});

test('safeValidateToolCall returns success for valid data', t => {
	const result = safeValidateToolCall({id: '1', name: 'x', args: {}});
	t.true(result.success);
});

test('safeValidateToolCall returns failure for invalid data', t => {
	const result = safeValidateToolCall({name: 'x'});
	t.false(result.success);
});

test('safeValidateAgentEvent returns success for valid event', t => {
	const result = safeValidateAgentEvent({
		type: 'done',
		reason: 'ok',
		timestamp: 1,
	});
	t.true(result.success);
});

test('safeValidateAgentEvent returns failure for invalid event', t => {
	const result = safeValidateAgentEvent({type: 'bad_type'});
	t.false(result.success);
});

test('safeValidateAgentConfig returns success for valid config', t => {
	const result = safeValidateAgentConfig({
		systemPrompt: 'test',
		maxIterations: 10,
		maxErrors: 1,
	});
	t.true(result.success);
});

test('safeValidateAgentConfig returns failure for invalid config', t => {
	const result = safeValidateAgentConfig({maxIterations: -1});
	t.false(result.success);
});
