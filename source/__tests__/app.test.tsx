import React from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import {ContentPaneOne, ContentPaneTwo} from '../app.js';

test('ContentPaneOne renders correctly', t => {
	const {lastFrame} = render(<ContentPaneOne />);
	const frame = lastFrame() ?? '';

	t.true(
		frame.includes('first content area'),
		'Should render first pane content',
	);
});

test('ContentPaneTwo renders correctly', t => {
	const {lastFrame} = render(<ContentPaneTwo />);
	const frame = lastFrame() ?? '';

	t.true(
		frame.includes('second content area'),
		'Should render second pane content',
	);
});
