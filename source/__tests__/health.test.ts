/**
 * Tests for health command and fetchHealth API function
 */

import test from 'ava';
import {fetchHealth} from '../lib/api.js';

// Test fetchHealth with invalid host (network error)
test('fetchHealth returns error for invalid host', async t => {
	const result = await fetchHealth('http://localhost:99999');

	t.false(result.success);
	t.truthy(result.error);
});

// Test fetchHealth returns correct structure on error
test('fetchHealth error response has correct structure', async t => {
	const result = await fetchHealth(
		'http://invalid-host-that-does-not-exist.local',
	);

	t.false(result.success);
	t.is(result.data, undefined);
	t.truthy(result.error);
	t.is(typeof result.error, 'string');
});

// Test fetchHealth handles trailing slash in host
test('fetchHealth handles trailing slash in host URL', async t => {
	// This test verifies the URL construction doesn't double-slash
	// We can't test the actual API call without a server, but we can verify
	// the function doesn't throw with a trailing slash host
	const result = await fetchHealth('http://localhost:99999/');

	t.false(result.success);
	t.truthy(result.error);
});

// Test that HealthResponse type structure is expected
test('fetchHealth response includes expected error properties', async t => {
	const result = await fetchHealth('http://localhost:99999');

	t.true('success' in result);
	t.true('error' in result || 'data' in result);
});
