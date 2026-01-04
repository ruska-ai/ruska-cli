/**
 * Tests for truncation utilities
 */

import test from 'ava';
import {truncate} from '../lib/output/truncate.js';

test('truncate returns original text when under limits', t => {
	const result = truncate('short text');
	t.is(result.text, 'short text');
	t.false(result.wasTruncated);
});

test('truncate truncates by character count', t => {
	const longText = 'a'.repeat(600);
	const result = truncate(longText, {maxLength: 100, maxLines: 100});

	t.true(result.wasTruncated);
	t.true(result.text.length <= 100);
	t.true(result.text.endsWith('... [truncated]'));
});

test('truncate truncates by line count', t => {
	const multilineText = Array.from(
		{length: 20},
		(_, i) => `Line ${i + 1}`,
	).join('\n');
	const result = truncate(multilineText, {maxLength: 10_000, maxLines: 5});

	t.true(result.wasTruncated);
	const lines = result.text.split('\n');
	// 5 content lines + 1 truncation indicator line
	t.is(lines.length, 6);
	t.true(result.text.endsWith('... [truncated]'));
});

test('truncate applies line truncation before character truncation', t => {
	// Create text with many lines, each moderately long
	const multilineText = Array.from({length: 50}, () => 'x'.repeat(100)).join(
		'\n',
	);
	const result = truncate(multilineText, {maxLength: 200, maxLines: 5});

	t.true(result.wasTruncated);
	t.true(result.text.length <= 200);
});

test('truncate uses custom indicator', t => {
	const longText = 'a'.repeat(600);
	const result = truncate(longText, {
		maxLength: 100,
		indicator: '...',
	});

	t.true(result.wasTruncated);
	t.true(result.text.endsWith('...'));
});

test('truncate handles empty string', t => {
	const result = truncate('');
	t.is(result.text, '');
	t.false(result.wasTruncated);
});

test('truncate handles text exactly at limit', t => {
	const text = 'a'.repeat(500);
	const result = truncate(text, {maxLength: 500});

	t.is(result.text, text);
	t.false(result.wasTruncated);
});

test('truncate handles very small maxLength', t => {
	const result = truncate('Hello World', {maxLength: 5});

	t.true(result.wasTruncated);
	// When maxLength is smaller than indicator, just return indicator
	t.is(result.text, '... [truncated]');
});

test('truncate uses default values', t => {
	// Default is 500 chars and 10 lines
	const shortText = 'Hello';
	const result = truncate(shortText);

	t.is(result.text, shortText);
	t.false(result.wasTruncated);
});
