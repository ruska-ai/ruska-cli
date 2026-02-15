/**
 * Example: Error Handling & Self-Healing
 *
 * Demonstrates error normalization, recoverability checks,
 * and formatting errors for LLM context injection.
 *
 * Run: npx tsx source/core/examples/07-errors.ts
 */

import {compactify, isRecoverable, formatForContext} from '../errors.js';

function main() {
	// --- 1. Normalize an Error object ---
	const err1 = compactify(new Error('Connection timeout'), 1, 3);
	console.log('From Error:', err1);
	console.log('Recoverable?', isRecoverable(err1)); // true (attempt 1 < maxAttempts 3)
	console.log('Context:', formatForContext(err1));
	// => "Error: Connection timeout | Attempt 1/3 | Recoverable"

	// --- 2. Normalize a string ---
	const err2 = compactify('Something went wrong', 2, 3);
	console.log('\nFrom string:', err2);
	console.log('Recoverable?', isRecoverable(err2)); // true

	// --- 3. Normalize an unknown value ---
	const err3 = compactify(42, 3, 3);
	console.log('\nFrom unknown:', err3);
	console.log('Recoverable?', isRecoverable(err3)); // false (attempt 3 >= maxAttempts 3)
	console.log('Context:', formatForContext(err3));
	// => "Error: Unknown error | Attempt 3/3 | Fatal"

	// --- 4. Error with a code property ---
	const codedError = Object.assign(new Error('Rate limited'), {code: 'RATE_LIMIT'});
	const err4 = compactify(codedError, 1, 5);
	console.log('\nWith code:', formatForContext(err4));
	// => "Error: Rate limited | Code: RATE_LIMIT | Attempt 1/5 | Recoverable"

	// --- 5. Simulating retry progression ---
	console.log('\n--- Retry progression ---');
	for (let attempt = 1; attempt <= 4; attempt++) {
		const error = compactify(new Error('API error'), attempt, 3);
		console.log(
			`  Attempt ${attempt}: recoverable=${isRecoverable(error)} | ${formatForContext(error)}`,
		);
	}
}

main();
