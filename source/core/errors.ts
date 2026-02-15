/**
 * Compact error handling with retry tracking for the 12-factor agent.
 * Pure functions that normalize errors for LLM context and self-healing.
 */

import {type CompactError} from './schemas.js';

/**
 * Normalize any thrown value into a CompactError shape.
 */
export function compactify(
	error: unknown,
	attempt: number,
	maxAttempts: number,
): CompactError {
	const message
		= error instanceof Error
			? error.message
			: typeof error === 'string'
				? error
				: 'Unknown error';

	const code
		= error instanceof Error && 'code' in error
			? String((error as Error & {code: unknown}).code)
			: undefined;

	return {
		message,
		...(code ? {code} : {}),
		attempt,
		maxAttempts,
		recoverable: attempt < maxAttempts,
		timestamp: Date.now(),
	};
}

/**
 * Check whether a compact error still has retries remaining.
 */
export function isRecoverable(error: CompactError): boolean {
	return error.recoverable && error.attempt < error.maxAttempts;
}

/**
 * Format a compact error as a terse string suitable for LLM context injection.
 */
export function formatForContext(error: CompactError): string {
	const parts = [
		`Error: ${error.message}`,
		...(error.code ? [`Code: ${error.code}`] : []),
		`Attempt ${error.attempt}/${error.maxAttempts}`,
		error.recoverable ? 'Recoverable' : 'Fatal',
	];
	return parts.join(' | ');
}
