/**
 * Tests for tools parsing utilities
 */

import test from 'ava';
import {parseToolsFlag, defaultAgentTools} from '../lib/tools.js';

// Default behavior tests
test('parseToolsFlag returns default tools when undefined', t => {
	const result = parseToolsFlag(undefined);
	t.deepEqual(result, [...defaultAgentTools]);
});

test('parseToolsFlag returns default tools when empty string', t => {
	const result = parseToolsFlag('');
	t.deepEqual(result, [...defaultAgentTools]);
});

test('parseToolsFlag returns default tools when whitespace only', t => {
	const result = parseToolsFlag('   ');
	t.deepEqual(result, [...defaultAgentTools]);
});

// Disabled mode tests
test('parseToolsFlag returns empty array for "disabled"', t => {
	const result = parseToolsFlag('disabled');
	t.deepEqual(result, []);
});

test('parseToolsFlag handles "DISABLED" case-insensitively', t => {
	const result = parseToolsFlag('DISABLED');
	t.deepEqual(result, []);
});

test('parseToolsFlag handles "Disabled" case-insensitively', t => {
	const result = parseToolsFlag('Disabled');
	t.deepEqual(result, []);
});

// Custom tools tests
test('parseToolsFlag parses single tool', t => {
	const result = parseToolsFlag('web_search');
	t.deepEqual(result, ['web_search']);
});

test('parseToolsFlag parses comma-separated tools', t => {
	const result = parseToolsFlag('web_search,think_tool');
	t.deepEqual(result, ['web_search', 'think_tool']);
});

test('parseToolsFlag parses multiple tools', t => {
	const result = parseToolsFlag('web_search,think_tool,math_calculator');
	t.deepEqual(result, ['web_search', 'think_tool', 'math_calculator']);
});

test('parseToolsFlag trims whitespace from tool names', t => {
	const result = parseToolsFlag('  web_search , think_tool  ');
	t.deepEqual(result, ['web_search', 'think_tool']);
});

test('parseToolsFlag filters empty entries', t => {
	const result = parseToolsFlag('web_search,,think_tool');
	t.deepEqual(result, ['web_search', 'think_tool']);
});

test('parseToolsFlag handles trailing comma', t => {
	const result = parseToolsFlag('web_search,think_tool,');
	t.deepEqual(result, ['web_search', 'think_tool']);
});

test('parseToolsFlag handles leading comma', t => {
	const result = parseToolsFlag(',web_search,think_tool');
	t.deepEqual(result, ['web_search', 'think_tool']);
});

test('parseToolsFlag handles multiple consecutive commas', t => {
	const result = parseToolsFlag('web_search,,,think_tool');
	t.deepEqual(result, ['web_search', 'think_tool']);
});

// DefaultAgentTools constant tests
test('defaultAgentTools contains web_search', t => {
	t.true(defaultAgentTools.includes('web_search'));
});

test('defaultAgentTools contains web_scrape', t => {
	t.true(defaultAgentTools.includes('web_scrape'));
});

test('defaultAgentTools contains math_calculator', t => {
	t.true(defaultAgentTools.includes('math_calculator'));
});

test('defaultAgentTools contains think_tool', t => {
	t.true(defaultAgentTools.includes('think_tool'));
});

test('defaultAgentTools contains python_sandbox', t => {
	t.true(defaultAgentTools.includes('python_sandbox'));
});

test('defaultAgentTools has exactly 5 tools', t => {
	t.is(defaultAgentTools.length, 5);
});

// Immutability test
test('parseToolsFlag returns a new array for defaults', t => {
	const result1 = parseToolsFlag(undefined);
	const result2 = parseToolsFlag(undefined);
	t.not(result1, result2);
	t.deepEqual(result1, result2);
});
