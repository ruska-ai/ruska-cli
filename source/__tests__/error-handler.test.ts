/**
 * Tests for error handler and exit codes
 */

import test from 'ava';
import {classifyError, exitCodes} from '../lib/output/error-handler.js';

// Exit codes tests
test('exitCodes has correct values', t => {
	t.is(exitCodes.success, 0);
	t.is(exitCodes.networkError, 1);
	t.is(exitCodes.authFailed, 2);
	t.is(exitCodes.rateLimited, 3);
	t.is(exitCodes.timeout, 4);
	t.is(exitCodes.serverError, 5);
});

// Status code classification tests
test('classifyError handles 401 status code', t => {
	const result = classifyError(new Error('Unauthorized'), 401);
	t.is(result.code, 'AUTH_FAILED');
	t.is(result.exitCode, exitCodes.authFailed);
	t.false(result.recoverable);
});

test('classifyError handles 403 status code', t => {
	const result = classifyError(new Error('Forbidden'), 403);
	t.is(result.code, 'AUTH_FAILED');
	t.is(result.exitCode, exitCodes.authFailed);
});

test('classifyError handles 429 status code', t => {
	const result = classifyError(new Error('Too many requests'), 429);
	t.is(result.code, 'RATE_LIMITED');
	t.is(result.exitCode, exitCodes.rateLimited);
	t.true(result.recoverable);
});

test('classifyError handles 500 status code', t => {
	const result = classifyError(new Error('Internal server error'), 500);
	t.is(result.code, 'SERVER_ERROR');
	t.is(result.exitCode, exitCodes.serverError);
	t.true(result.recoverable);
});

test('classifyError handles 502 status code', t => {
	const result = classifyError(new Error('Bad gateway'), 502);
	t.is(result.code, 'SERVER_ERROR');
	t.is(result.exitCode, exitCodes.serverError);
});

test('classifyError handles 503 status code', t => {
	const result = classifyError(new Error('Service unavailable'), 503);
	t.is(result.code, 'SERVER_ERROR');
	t.is(result.exitCode, exitCodes.serverError);
});

// Error message classification tests
test('classifyError detects network error from message', t => {
	const result = classifyError(new Error('fetch failed'));
	t.is(result.code, 'NETWORK_ERROR');
	t.is(result.exitCode, exitCodes.networkError);
	t.false(result.recoverable);
});

test('classifyError detects ECONNREFUSED', t => {
	const result = classifyError(new Error('ECONNREFUSED'));
	t.is(result.code, 'NETWORK_ERROR');
});

test('classifyError detects ENOTFOUND', t => {
	const result = classifyError(new Error('ENOTFOUND'));
	t.is(result.code, 'NETWORK_ERROR');
});

test('classifyError detects timeout from AbortError', t => {
	const error = new Error('The operation was aborted');
	error.name = 'AbortError';
	const result = classifyError(error);
	t.is(result.code, 'TIMEOUT');
	t.is(result.exitCode, exitCodes.timeout);
	t.true(result.recoverable);
});

test('classifyError detects timeout from message', t => {
	const result = classifyError(new Error('Request timeout'));
	t.is(result.code, 'TIMEOUT');
});

test('classifyError detects auth error from 401 in message', t => {
	const result = classifyError(new Error('HTTP 401'));
	t.is(result.code, 'AUTH_FAILED');
});

test('classifyError detects unauthorized from message', t => {
	const result = classifyError(new Error('Unauthorized access'));
	t.is(result.code, 'AUTH_FAILED');
});

test('classifyError detects rate limit from message', t => {
	const result = classifyError(new Error('Rate limit exceeded'));
	t.is(result.code, 'RATE_LIMITED');
});

test('classifyError detects 429 in message', t => {
	const result = classifyError(new Error('HTTP 429'));
	t.is(result.code, 'RATE_LIMITED');
});

test('classifyError detects server error from 500 in message', t => {
	const result = classifyError(new Error('HTTP 500'));
	t.is(result.code, 'SERVER_ERROR');
});

// Default classification
test('classifyError returns STREAM_INTERRUPTED for unknown errors', t => {
	const result = classifyError(new Error('Something unexpected'));
	t.is(result.code, 'STREAM_INTERRUPTED');
	t.is(result.exitCode, exitCodes.networkError);
});

test('classifyError handles non-Error objects', t => {
	const result = classifyError('string error');
	t.is(result.code, 'STREAM_INTERRUPTED');
	t.is(result.message, 'Unknown error occurred');
});

test('classifyError preserves error message for unknown errors', t => {
	const result = classifyError(new Error('Custom error message'));
	t.is(result.message, 'Custom error message');
});

// Status code takes precedence over message
test('status code takes precedence over message content', t => {
	// Message says timeout but status is 401
	const result = classifyError(new Error('timeout'), 401);
	t.is(result.code, 'AUTH_FAILED');
});
