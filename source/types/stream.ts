/**
 * Stream types for /api/llm/stream endpoint
 * @see backend/src/utils/stream.py:handle_multi_mode
 */

/**
 * Stream event types matching backend SSE format
 */
export type StreamEventType =
	| 'messages'
	| 'values'
	| 'error'
	| 'metadata'
	| 'done';

/**
 * Special SSE markers from distributed stream
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const STREAM_DONE_MARKER = '[DONE]';

/**
 * Response from POST /llm/stream when DISTRIBUTED_WORKERS=true
 */
export type DistributedResponse = {
	thread_id: string;
	distributed: true;
};

/**
 * Type guard for distributed response with strict validation
 * Validates thread_id exists, is non-empty, and within bounds
 */
export function isDistributedResponse(
	data: unknown,
): data is DistributedResponse {
	if (typeof data !== 'object' || data === null) {
		return false;
	}

	const obj = data as Record<string, unknown>;

	if (obj['distributed'] !== true) {
		return false;
	}

	const threadId = obj['thread_id'];
	if (typeof threadId !== 'string') {
		return false;
	}

	// Strict validation: non-empty and bounded length (prevent DoS)
	if (threadId.length === 0 || threadId.length > 256) {
		return false;
	}

	return true;
}

/**
 * Error response format from distributed stream
 */
export type DistributedErrorResponse = {
	error: string;
};

/**
 * Type guard for distributed error format
 */
export function isDistributedError(
	data: unknown,
): data is DistributedErrorResponse {
	if (typeof data !== 'object' || data === null) {
		return false;
	}

	const obj = data as Record<string, unknown>;
	return typeof obj['error'] === 'string';
}

/**
 * Content block for multi-modal messages
 */
export type ContentBlock = {
	[key: string]: unknown;
	text?: string;
	type?: string;
};

/**
 * Message chunk payload from 'messages' events
 */
export type MessagePayload = {
	id?: string;
	type?: string;
	name?: string;
	content: string | ContentBlock[] | undefined;
	tool_calls?: Array<{
		id: string;
		name: string;
		args: Record<string, unknown>;
	}>;
	response_metadata?: Record<string, unknown>;
};

/**
 * Extract text content from a MessagePayload.
 * Handles both string content and multi-modal content blocks.
 */
export function extractContent(
	content: string | ContentBlock[] | undefined,
): string | undefined {
	if (typeof content === 'string') {
		return content;
	}

	return content?.[0]?.text;
}

/**
 * Values chunk payload from 'values' events
 * This contains the complete final response object
 */
export type ValuesPayload = {
	messages: Array<Record<string, unknown>>;
	files?: Record<string, unknown>;
	todos?: Array<Record<string, unknown>>;
};

/**
 * Error payload from 'error' events
 */
export type ErrorPayload = {
	message: string;
};

/**
 * Metadata payload from 'metadata' events
 * Sent at the start of stream with thread/session info
 */
export type MetadataPayload = {
	thread_id?: string;
	assistant_id?: string;
	project_id?: string;
};

/**
 * Discriminated union for stream events
 */
export type StreamEvent =
	| {type: 'messages'; payload: MessagePayload[]; metadata?: unknown}
	| {type: 'values'; payload: ValuesPayload}
	| {type: 'error'; payload: ErrorPayload}
	| {type: 'metadata'; payload: MetadataPayload}
	| {type: 'done'; payload: undefined};

/**
 * Request body for /llm/stream endpoint
 * @see backend/src/schemas/entities/llm.py:LLMRequest
 */
export type StreamRequest = {
	input: {
		messages: Array<{role: 'user' | 'assistant' | 'system'; content: string}>;
		files?: Record<string, unknown>;
	};
	model?: string;
	tools?: string[];
	metadata?: {
		assistant_id?: string;
		thread_id?: string;
		project_id?: string;
	};
};

/**
 * Stream handle for controlling active stream
 */
export type StreamHandle = {
	events: AsyncIterable<StreamEvent>;
	abort: () => void;
};
