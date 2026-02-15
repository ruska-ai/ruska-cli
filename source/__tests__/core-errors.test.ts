import test from 'ava';
import {compactify, isRecoverable, formatForContext} from '../core/errors.js';
import {type CompactError, compactErrorSchema} from '../core/schemas.js';

// ---------------------------------------------------------------------------
// compactify — Error input
// ---------------------------------------------------------------------------

test('compactify: normalizes Error into CompactError', t => {
	const result = compactify(new Error('something broke'), 1, 3);
	t.is(result.message, 'something broke');
	t.is(result.attempt, 1);
	t.is(result.maxAttempts, 3);
	t.true(result.recoverable);
	t.is(typeof result.timestamp, 'number');
});

test('compactify: extracts code from Error with code property', t => {
	const error = Object.assign(new Error('conn refused'), {
		code: 'ECONNREFUSED',
	});
	const result = compactify(error, 2, 3);
	t.is(result.message, 'conn refused');
	t.is(result.code, 'ECONNREFUSED');
});

test('compactify: omits code when Error has no code property', t => {
	const result = compactify(new Error('plain error'), 1, 3);
	t.is(result.code, undefined);
});

// ---------------------------------------------------------------------------
// compactify — string input
// ---------------------------------------------------------------------------

test('compactify: normalizes string into CompactError', t => {
	const result = compactify('string error message', 1, 2);
	t.is(result.message, 'string error message');
	t.is(result.attempt, 1);
	t.is(result.maxAttempts, 2);
});

// ---------------------------------------------------------------------------
// compactify — unknown input
// ---------------------------------------------------------------------------

test('compactify: normalizes unknown input (number)', t => {
	const result = compactify(42, 1, 1);
	t.is(result.message, 'Unknown error');
});

test('compactify: normalizes unknown input (null)', t => {
	const result = compactify(null, 1, 1);
	t.is(result.message, 'Unknown error');
});

test('compactify: normalizes unknown input (undefined)', t => {
	const result = compactify(undefined, 1, 1);
	t.is(result.message, 'Unknown error');
});

test('compactify: normalizes unknown input (object)', t => {
	const result = compactify({foo: 'bar'}, 1, 1);
	t.is(result.message, 'Unknown error');
});

// ---------------------------------------------------------------------------
// compactify — recoverable flag
// ---------------------------------------------------------------------------

test('compactify: marks recoverable when attempt < maxAttempts', t => {
	const result = compactify(new Error('err'), 1, 3);
	t.true(result.recoverable);
});

test('compactify: marks not recoverable when attempt >= maxAttempts', t => {
	const result = compactify(new Error('err'), 3, 3);
	t.false(result.recoverable);
});

test('compactify: marks not recoverable when attempt > maxAttempts', t => {
	const result = compactify(new Error('err'), 4, 3);
	t.false(result.recoverable);
});

// ---------------------------------------------------------------------------
// compactify — schema validation
// ---------------------------------------------------------------------------

test('compactify: output validates against compactErrorSchema', t => {
	const result = compactify(new Error('schema check'), 1, 3);
	const parsed = compactErrorSchema.safeParse(result);
	t.true(parsed.success);
});

test('compactify: output with code validates against compactErrorSchema', t => {
	const error = Object.assign(new Error('with code'), {code: 'ERR_CODE'});
	const result = compactify(error, 2, 5);
	const parsed = compactErrorSchema.safeParse(result);
	t.true(parsed.success);
});

// ---------------------------------------------------------------------------
// isRecoverable
// ---------------------------------------------------------------------------

test('isRecoverable: returns true when recoverable and attempt < maxAttempts', t => {
	const error: CompactError = {
		message: 'err',
		attempt: 1,
		maxAttempts: 3,
		recoverable: true,
		timestamp: Date.now(),
	};
	t.true(isRecoverable(error));
});

test('isRecoverable: returns false when not recoverable', t => {
	const error: CompactError = {
		message: 'err',
		attempt: 1,
		maxAttempts: 3,
		recoverable: false,
		timestamp: Date.now(),
	};
	t.false(isRecoverable(error));
});

test('isRecoverable: returns false when attempt equals maxAttempts', t => {
	const error: CompactError = {
		message: 'err',
		attempt: 3,
		maxAttempts: 3,
		recoverable: true,
		timestamp: Date.now(),
	};
	t.false(isRecoverable(error));
});

test('isRecoverable: returns false when attempt exceeds maxAttempts', t => {
	const error: CompactError = {
		message: 'err',
		attempt: 5,
		maxAttempts: 3,
		recoverable: true,
		timestamp: Date.now(),
	};
	t.false(isRecoverable(error));
});

// ---------------------------------------------------------------------------
// formatForContext
// ---------------------------------------------------------------------------

test('formatForContext: formats basic error without code', t => {
	const error: CompactError = {
		message: 'timeout occurred',
		attempt: 1,
		maxAttempts: 3,
		recoverable: true,
		timestamp: Date.now(),
	};
	const result = formatForContext(error);
	t.is(result, 'Error: timeout occurred | Attempt 1/3 | Recoverable');
});

test('formatForContext: includes code when present', t => {
	const error: CompactError = {
		message: 'connection failed',
		code: 'ECONNREFUSED',
		attempt: 2,
		maxAttempts: 3,
		recoverable: true,
		timestamp: Date.now(),
	};
	const result = formatForContext(error);
	t.is(
		result,
		'Error: connection failed | Code: ECONNREFUSED | Attempt 2/3 | Recoverable',
	);
});

test('formatForContext: shows Fatal for non-recoverable errors', t => {
	const error: CompactError = {
		message: 'fatal error',
		attempt: 3,
		maxAttempts: 3,
		recoverable: false,
		timestamp: Date.now(),
	};
	const result = formatForContext(error);
	t.is(result, 'Error: fatal error | Attempt 3/3 | Fatal');
});

test('formatForContext: handles first attempt', t => {
	const error: CompactError = {
		message: 'first try',
		attempt: 1,
		maxAttempts: 1,
		recoverable: false,
		timestamp: Date.now(),
	};
	const result = formatForContext(error);
	t.is(result, 'Error: first try | Attempt 1/1 | Fatal');
});
