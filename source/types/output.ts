/**
 * Output types for CLI stream command
 * Simplified schema per REVIEW.md (no timestamps/sequence for MVP)
 */

import type {ValuesPayload} from './stream.js';

/**
 * Content chunk during streaming
 */
export type ChunkOutput = {
	type: 'chunk';
	content: string;
};

/**
 * Tool call event
 */
export type ToolCallOutput = {
	type: 'tool_call';
	id: string;
	name: string;
	args: Record<string, unknown>;
};

/**
 * Tool result event
 */
export type ToolResultOutput = {
	type: 'tool_result';
	toolCallId: string;
	content: string;
	isError?: boolean;
};

/**
 * Final complete response (from backend "values" event)
 */
export type DoneOutput = {
	type: 'done';
	response: ValuesPayload;
};

/**
 * Error event
 */
export type ErrorOutput = {
	type: 'error';
	code: ErrorCode;
	message: string;
};

/**
 * Typed error codes for programmatic handling
 */
export type ErrorCode =
	| 'AUTH_FAILED'
	| 'NETWORK_ERROR'
	| 'RATE_LIMITED'
	| 'INVALID_REQUEST'
	| 'STREAM_INTERRUPTED'
	| 'PARSE_ERROR'
	| 'SERVER_ERROR'
	| 'TIMEOUT'
	| 'DISTRIBUTED_ERROR'
	| 'DISTRIBUTED_TIMEOUT';

/**
 * Union of all output types
 */
export type StreamOutput =
	| ChunkOutput
	| ToolCallOutput
	| ToolResultOutput
	| DoneOutput
	| ErrorOutput;
