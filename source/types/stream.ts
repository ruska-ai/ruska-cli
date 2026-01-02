/**
 * Stream types for /api/llm/stream endpoint
 * @see backend/src/utils/stream.py:handle_multi_mode
 */

/**
 * Stream event types matching backend SSE format
 */
export type StreamEventType = 'messages' | 'values' | 'error';

/**
 * Content block for multi-modal messages
 */
export type ContentBlock = {
	text?: string;
	type?: string;
	[key: string]: unknown;
};

/**
 * Message chunk payload from 'messages' events
 */
export type MessagePayload = {
	id?: string;
	type?: string;
	content: string | ContentBlock[] | undefined;
	tool_calls?: Array<{
		id: string;
		name: string;
		args: Record<string, unknown>;
	}>;
	response_metadata?: Record<string, unknown>;
};

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
 * Discriminated union for stream events
 */
export type StreamEvent =
	| {type: 'messages'; payload: MessagePayload[]; metadata?: unknown}
	| {type: 'values'; payload: ValuesPayload}
	| {type: 'error'; payload: ErrorPayload};

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
