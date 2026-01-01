/**
 * Error handler with taxonomy for CLI output
 * From Gamma proposal with structured error codes
 */

import type {ErrorCode} from '../../types/output.js';

export type ErrorMapping = {
	code: ErrorCode;
	message: string;
	recoverable: boolean;
	exitCode: number;
};

/**
 * Exit codes for scripting
 */
export const exitCodes = {
	success: 0,
	networkError: 1,
	authFailed: 2,
	rateLimited: 3,
	timeout: 4,
	serverError: 5,
} as const;

/**
 * Map raw errors to structured error responses
 */
export function classifyError(
	error: unknown,
	statusCode?: number,
): ErrorMapping {
	// Handle status code based errors first
	if (statusCode !== undefined) {
		if (statusCode === 401 || statusCode === 403) {
			return {
				code: 'AUTH_FAILED',
				message: 'Authentication failed. Run `ruska auth` to reconfigure.',
				recoverable: false,
				exitCode: exitCodes.authFailed,
			};
		}

		if (statusCode === 429) {
			return {
				code: 'RATE_LIMITED',
				message: 'Rate limit exceeded. Please wait before retrying.',
				recoverable: true,
				exitCode: exitCodes.rateLimited,
			};
		}

		if (statusCode >= 500) {
			return {
				code: 'SERVER_ERROR',
				message: `Server error (HTTP ${statusCode}). Please try again later.`,
				recoverable: true,
				exitCode: exitCodes.serverError,
			};
		}
	}

	if (error instanceof Error) {
		const errorMessage = error.message.toLowerCase();

		// Network errors
		if (
			errorMessage.includes('fetch failed') ||
			errorMessage.includes('econnrefused') ||
			errorMessage.includes('network') ||
			errorMessage.includes('enotfound')
		) {
			return {
				code: 'NETWORK_ERROR',
				message:
					'Unable to connect to server. Check your network and host configuration.',
				recoverable: false,
				exitCode: exitCodes.networkError,
			};
		}

		// Auth errors from message
		if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
			return {
				code: 'AUTH_FAILED',
				message: 'Authentication failed. Run `ruska auth` to reconfigure.',
				recoverable: false,
				exitCode: exitCodes.authFailed,
			};
		}

		// Rate limiting from message
		if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
			return {
				code: 'RATE_LIMITED',
				message: 'Rate limit exceeded. Please wait before retrying.',
				recoverable: true,
				exitCode: exitCodes.rateLimited,
			};
		}

		// Timeout / abort
		if (
			error.name === 'AbortError' ||
			errorMessage.includes('timeout') ||
			errorMessage.includes('aborted')
		) {
			return {
				code: 'TIMEOUT',
				message: 'Request timed out. The server may be overloaded.',
				recoverable: true,
				exitCode: exitCodes.timeout,
			};
		}

		// Server errors from message
		if (
			errorMessage.includes('500') ||
			errorMessage.includes('502') ||
			errorMessage.includes('503')
		) {
			return {
				code: 'SERVER_ERROR',
				message: `Server error: ${error.message}`,
				recoverable: true,
				exitCode: exitCodes.serverError,
			};
		}
	}

	// Default
	return {
		code: 'STREAM_INTERRUPTED',
		message: error instanceof Error ? error.message : 'Unknown error occurred',
		recoverable: false,
		exitCode: exitCodes.networkError,
	};
}
