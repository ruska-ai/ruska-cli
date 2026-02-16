/**
 * Model interface — LLM abstraction layer.
 * Decouples the agent loop from the specific streaming implementation.
 * Bridges between core schemas and the existing StreamService.
 */

import type {StreamServiceInterface} from '../lib/services/stream-service.interface.js';
import type {
	StreamMessage,
	StreamEvent,
	MessagePayload,
	ContentBlock,
} from '../types/stream.js';
import {
	type CoreMessage,
	type ToolDefinition,
	type ModelResult,
	type ToolCall,
	modelResultSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// ModelInterface — the abstraction the agent loop depends on
// ---------------------------------------------------------------------------

export type ModelInterface = {
	invoke(
		messages: CoreMessage[],
		tools?: ToolDefinition[],
	): Promise<ModelResult>;
};

// ---------------------------------------------------------------------------
// StreamModel config
// ---------------------------------------------------------------------------

export type StreamModelConfig = {
	service: StreamServiceInterface;
	model?: string;
	assistantId?: string;
	threadId?: string;
};

// ---------------------------------------------------------------------------
// Conversion helpers — CoreMessage <-> StreamMessage
// ---------------------------------------------------------------------------

export function coreToStreamMessage(msg: CoreMessage): StreamMessage {
	if (msg.role === 'tool') {
		return {
			role: 'tool',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			tool_call_id: msg.toolCallId ?? '',
			content: msg.content,
		};
	}

	return {
		role: msg.role,
		content: msg.content,
	};
}

export function streamToolCallsToCoreToolCalls(
	toolCalls: Array<{id: string; name: string; args: Record<string, unknown>}>,
): ToolCall[] {
	return toolCalls.map(tc => ({
		id: tc.id,
		name: tc.name,
		args: tc.args,
	}));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toolDefsToStreamTools(tools: ToolDefinition[]): string[] {
	return tools.map(t => t.name);
}

function extractTextFromBlocks(blocks: ContentBlock[]): string {
	let text = '';
	for (const block of blocks) {
		if (block.text) {
			text += block.text;
		}
	}

	return text;
}

function extractTextFromPayload(msg: MessagePayload): string {
	if (typeof msg.content === 'string') {
		return msg.content;
	}

	if (Array.isArray(msg.content)) {
		return extractTextFromBlocks(msg.content);
	}

	return '';
}

// ---------------------------------------------------------------------------
// Collect model result from stream events
// ---------------------------------------------------------------------------

function collectModelResult(events: StreamEvent[]): ModelResult {
	let content = '';
	let toolCalls: ToolCall[] | undefined;
	let done = false;

	for (const event of events) {
		switch (event.type) {
			case 'messages': {
				for (const msg of event.payload) {
					content += extractTextFromPayload(msg);

					if (msg.tool_calls && msg.tool_calls.length > 0) {
						const converted = streamToolCallsToCoreToolCalls(msg.tool_calls);
						toolCalls = toolCalls ? [...toolCalls, ...converted] : converted;
					}
				}

				break;
			}

			case 'done': {
				done = true;
				break;
			}

			case 'error': {
				throw new Error(`Stream error: ${event.payload.message}`);
			}

			default: {
				break;
			}
		}
	}

	const result: ModelResult = {
		content,
		...(toolCalls ? {toolCalls} : {}),
		...(done ? {done: true} : {}),
	};

	return modelResultSchema.parse(result);
}

// ---------------------------------------------------------------------------
// createStreamModel — factory that bridges StreamService to ModelInterface
// ---------------------------------------------------------------------------

export function createStreamModel(config: StreamModelConfig): ModelInterface {
	return {
		async invoke(
			messages: CoreMessage[],
			tools?: ToolDefinition[],
		): Promise<ModelResult> {
			const streamMessages: StreamMessage[] = messages.map(m =>
				coreToStreamMessage(m),
			);

			const handle = await config.service.connect({
				input: {messages: streamMessages},
				model: config.model,
				tools: tools ? toolDefsToStreamTools(tools) : undefined,
				metadata: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					assistant_id: config.assistantId,
					// eslint-disable-next-line @typescript-eslint/naming-convention
					thread_id: config.threadId,
				},
			});

			const collectedEvents: StreamEvent[] = [];
			for await (const event of handle.events) {
				collectedEvents.push(event);
			}

			return collectModelResult(collectedEvents);
		},
	};
}
