/**
 * Tests for Tool Registry.
 * Covers US-008: Implement Tool Registry
 */

import test from 'ava';
import {type ToolCall, type ToolDefinition} from '../core/schemas.js';
import {createToolRegistry, defineTool, type ToolExecutor} from '../core/tool.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const echoDefinition: ToolDefinition = {
	name: 'echo',
	description: 'Echoes the input back',
	parameters: {
		message: {type: 'string', description: 'The message to echo', required: true},
	},
};

const echoExecutor: ToolExecutor = async (args: Record<string, unknown>) =>
	`Echo: ${String(args['message'])}`;

const failDefinition: ToolDefinition = {
	name: 'fail_tool',
	description: 'Always fails',
	parameters: {},
};

const failExecutor: ToolExecutor = async () => {
	throw new Error('executor exploded');
};

const makeToolCall = (name: string, args: Record<string, unknown>): ToolCall => ({
	id: `tc-${Date.now()}`,
	name,
	args,
});

// =============================================================================
// createToolRegistry — basic operations
// =============================================================================

test('createToolRegistry returns registry with no tools', t => {
	const registry = createToolRegistry();
	t.deepEqual(registry.definitions(), []);
	t.false(registry.has('echo'));
});

test('register adds a tool definition', t => {
	const registry = createToolRegistry();
	registry.register(echoDefinition, echoExecutor);
	t.true(registry.has('echo'));
	t.is(registry.definitions().length, 1);
	t.is(registry.definitions()[0]!.name, 'echo');
});

test('register multiple tools', t => {
	const registry = createToolRegistry();
	registry.register(echoDefinition, echoExecutor);
	registry.register(failDefinition, failExecutor);
	t.is(registry.definitions().length, 2);
	t.true(registry.has('echo'));
	t.true(registry.has('fail_tool'));
});

test('register rejects duplicate tool name', t => {
	const registry = createToolRegistry();
	registry.register(echoDefinition, echoExecutor);
	t.throws(
		() => {
			registry.register(echoDefinition, echoExecutor);
		},
		{message: 'Tool "echo" is already registered'},
	);
});

test('register validates ToolDefinitionSchema', t => {
	const registry = createToolRegistry();
	const badDef = {name: 123, description: 'bad'} as unknown as ToolDefinition;
	t.throws(() => {
		registry.register(badDef, echoExecutor);
	});
});

// =============================================================================
// definitions — immutability
// =============================================================================

test('definitions returns a copy', t => {
	const registry = createToolRegistry();
	registry.register(echoDefinition, echoExecutor);
	const defs = registry.definitions();
	defs.pop();
	t.is(registry.definitions().length, 1, 'original list should be unmodified');
});

// =============================================================================
// has
// =============================================================================

test('has returns false for unregistered tool', t => {
	const registry = createToolRegistry();
	t.false(registry.has('nonexistent'));
});

test('has returns true for registered tool', t => {
	const registry = createToolRegistry();
	registry.register(echoDefinition, echoExecutor);
	t.true(registry.has('echo'));
});

// =============================================================================
// execute — success
// =============================================================================

test('execute returns successful ToolResult', async t => {
	const registry = createToolRegistry();
	registry.register(echoDefinition, echoExecutor);

	const call = makeToolCall('echo', {message: 'hello'});
	const result = await registry.execute(call);

	t.is(result.toolCallId, call.id);
	t.is(result.content, 'Echo: hello');
	t.is(result.isError, undefined);
});

// =============================================================================
// execute — error handling
// =============================================================================

test('execute catches executor errors and returns isError result', async t => {
	const registry = createToolRegistry();
	registry.register(failDefinition, failExecutor);

	const call = makeToolCall('fail_tool', {});
	const result = await registry.execute(call);

	t.is(result.toolCallId, call.id);
	t.is(result.content, 'executor exploded');
	t.true(result.isError);
});

test('execute catches non-Error throws and returns isError result', async t => {
	const registry = createToolRegistry();
	const stringThrow: ToolExecutor = async () => {
		// eslint-disable-next-line @typescript-eslint/only-throw-error
		throw 'string error';
	};

	registry.register(failDefinition, stringThrow);

	const call = makeToolCall('fail_tool', {});
	const result = await registry.execute(call);

	t.is(result.toolCallId, call.id);
	t.is(result.content, 'string error');
	t.true(result.isError);
});

// =============================================================================
// execute — unknown tool
// =============================================================================

test('execute returns isError for unknown tool name', async t => {
	const registry = createToolRegistry();

	const call = makeToolCall('nonexistent', {});
	const result = await registry.execute(call);

	t.is(result.toolCallId, call.id);
	t.is(result.content, 'Unknown tool: nonexistent');
	t.true(result.isError);
});

// =============================================================================
// execute — validates ToolCallSchema
// =============================================================================

test('execute validates tool call structure', async t => {
	const registry = createToolRegistry();
	registry.register(echoDefinition, echoExecutor);

	const badCall = {id: 123, name: 'echo', args: {}} as unknown as ToolCall;
	await t.throwsAsync(async () => registry.execute(badCall));
});

// =============================================================================
// defineTool — convenience builder
// =============================================================================

test('defineTool creates a valid ToolDefinition', t => {
	const def = defineTool('my_tool', 'Does things', {
		input: {type: 'string', description: 'Input value', required: true},
	});

	t.is(def.name, 'my_tool');
	t.is(def.description, 'Does things');
	t.deepEqual(def.parameters, {
		input: {type: 'string', description: 'Input value', required: true},
	});
});

test('defineTool with empty parameters', t => {
	const def = defineTool('no_params', 'No parameters', {});
	t.is(def.name, 'no_params');
	t.deepEqual(def.parameters, {});
});

test('defineTool validates the definition', t => {
	t.throws(() => {
		// Missing description
		defineTool('bad', undefined as unknown as string, {});
	});
});

// =============================================================================
// Integration: register + defineTool + execute
// =============================================================================

test('defineTool + register + execute full workflow', async t => {
	const registry = createToolRegistry();
	const def = defineTool('greet', 'Greets a person', {
		name: {type: 'string', description: 'Name to greet', required: true},
	});

	const executor: ToolExecutor = async (args: Record<string, unknown>) =>
		`Hello, ${String(args['name'])}!`;

	registry.register(def, executor);

	const call = makeToolCall('greet', {name: 'World'});
	const result = await registry.execute(call);

	t.is(result.content, 'Hello, World!');
	t.is(result.isError, undefined);
});
