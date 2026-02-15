/**
 * Tests for Bash Tool.
 * Covers US-009: Implement Bash Tool
 */

import test from 'ava';
import {type ToolCall} from '../core/schemas.js';
import {createToolRegistry} from '../core/tool.js';
import {
	bashToolDefinition,
	createBashExecutor,
	registerBashTool,
} from '../core/bash-tool.js';

// ---------------------------------------------------------------------------
// bashToolDefinition — shape
// ---------------------------------------------------------------------------

test('bashToolDefinition has correct name', t => {
	t.is(bashToolDefinition.name, 'bash');
});

test('bashToolDefinition has a description', t => {
	t.is(typeof bashToolDefinition.description, 'string');
	t.true(bashToolDefinition.description.length > 0);
});

test('bashToolDefinition has command parameter (required)', t => {
	const param = bashToolDefinition.parameters['command'];
	t.truthy(param);
	t.is(param!.type, 'string');
	t.is(param!.required, true);
});

test('bashToolDefinition has cwd parameter (optional)', t => {
	const param = bashToolDefinition.parameters['cwd'];
	t.truthy(param);
	t.is(param!.type, 'string');
	t.not(param!.required, true);
});

test('bashToolDefinition has timeout parameter (optional)', t => {
	const param = bashToolDefinition.parameters['timeout'];
	t.truthy(param);
	t.is(param!.type, 'number');
	t.not(param!.required, true);
});

// ---------------------------------------------------------------------------
// createBashExecutor — output
// ---------------------------------------------------------------------------

test('createBashExecutor returns a function', t => {
	const executor = createBashExecutor();
	t.is(typeof executor, 'function');
});

test('executor runs a simple command and returns formatted output', async t => {
	const executor = createBashExecutor();
	const result = await executor({command: 'echo hello'});
	t.is(typeof result, 'string');
	t.true(result.includes('Exit code: 0'));
	t.true(result.includes('hello'));
});

test('executor handles failed command', async t => {
	const executor = createBashExecutor();
	const result = await executor({command: 'exit 42'});
	t.is(typeof result, 'string');
	t.true(result.includes('Exit code: 42'));
});

test('executor handles blocked command gracefully', async t => {
	const executor = createBashExecutor();
	const result = await executor({command: 'rm -rf /'});
	t.is(typeof result, 'string');
	t.true(result.includes('STDERR'));
	t.true(result.includes('blocked'));
});

// ---------------------------------------------------------------------------
// registerBashTool — convenience
// ---------------------------------------------------------------------------

test('registerBashTool registers bash in a registry', t => {
	const registry = createToolRegistry();
	registerBashTool(registry);
	t.true(registry.has('bash'));
	t.is(registry.definitions().length, 1);
	t.is(registry.definitions()[0]!.name, 'bash');
});

test('registerBashTool tool is executable through the registry', async t => {
	const registry = createToolRegistry();
	registerBashTool(registry);

	const call: ToolCall = {
		id: 'tc-bash-1',
		name: 'bash',
		args: {command: 'echo registry-test'},
	};
	const result = await registry.execute(call);

	t.is(result.toolCallId, 'tc-bash-1');
	t.is(result.isError, undefined);
	t.true(result.content.includes('registry-test'));
	t.true(result.content.includes('Exit code: 0'));
});
