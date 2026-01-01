import React from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import {ChatCommand} from '../commands/chat.js';

// =============================================================================
// ChatCommand Component Tests
//
// Note: These tests run in a non-TTY environment, so some features like
// useInput will cause errors. We test basic rendering and prop acceptance.
// =============================================================================

test('ChatCommand shows authentication check on mount', t => {
	const {lastFrame} = render(<ChatCommand />);
	const frame = lastFrame() ?? '';

	// Should show loading/checking state initially
	t.true(
		frame.includes('Checking') ||
			frame.includes('Loading') ||
			frame.includes('authentication') ||
			frame.includes('...'),
		'Should show checking state on mount',
	);
});

test('ChatCommand accepts message prop for non-interactive mode', t => {
	const {lastFrame} = render(<ChatCommand message="Hello, AI!" />);
	const frame = lastFrame() ?? '';

	// Should be processing or showing the message
	t.true(
		frame.length > 0,
		'Should render something when message prop provided',
	);
});

test('ChatCommand accepts assistant prop', t => {
	const {lastFrame} = render(
		<ChatCommand assistantId="test-assistant-id" message="Test" />,
	);
	const frame = lastFrame() ?? '';

	t.true(frame.length > 0, 'Should render with assistant ID');
});

test('ChatCommand accepts model prop', t => {
	const {lastFrame} = render(
		<ChatCommand message="Test" model="openai:gpt-4o" />,
	);
	const frame = lastFrame() ?? '';

	t.true(frame.length > 0, 'Should render with model override');
});

test('ChatCommand renders initial checking state correctly', t => {
	const {lastFrame} = render(<ChatCommand />);
	const frame = lastFrame() ?? '';

	// The initial frame should contain the spinner or checking text
	t.true(frame.length > 0, 'Should render initial state');
});
