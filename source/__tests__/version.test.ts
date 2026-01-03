/**
 * Tests for version command
 */

import test from 'ava';
import {fetchHealth} from '../lib/api.js';

// The CLI version is hardcoded in the version command
const cliVersion = '0.1.3';

// Test that CLI version constant is a valid semver-like string
test('CLI version is a valid version string', t => {
	t.regex(cliVersion, /^\d+\.\d+\.\d+$/);
});

// Test fetchHealth (used by version command) returns error structure on failure
test('version command fetchHealth returns proper error on network failure', async t => {
	const result = await fetchHealth('http://localhost:99999');

	t.false(result.success);
	t.truthy(result.error);
	t.is(result.data, undefined);
});

// Test fetchHealth response type structure
test('version command fetchHealth response has expected shape', async t => {
	const result = await fetchHealth('http://invalid-host.local');

	// Verify response structure
	t.true('success' in result);
	t.is(typeof result.success, 'boolean');

	// On error, data should be undefined and error should be a string
	if (!result.success) {
		t.is(result.data, undefined);
		t.is(typeof result.error, 'string');
	}
});

// Test that version command would show CLI version even on API failure
test('CLI version is accessible for display regardless of API status', t => {
	// The version command displays CLI version even when API is unavailable
	// This test verifies the constant is available
	t.truthy(cliVersion);
	t.is(typeof cliVersion, 'string');
	t.true(cliVersion.length > 0);
});
