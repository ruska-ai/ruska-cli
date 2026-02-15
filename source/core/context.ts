/**
 * Context Builder — builds a model context window from the event log.
 * Reconstructs CoreMessage[] from AgentEvent[], applies windowing,
 * and injects error context for self-healing.
 * Covers US-007.
 */

import {type AgentEvent, type CoreMessage} from './schemas.js';
import {formatForContext} from './errors.js';

export type BuildContextOptions = {
	/** System prompt to prepend as the first message. */
	systemPrompt?: string;
	/** Maximum number of messages (excluding the system message) to include. */
	maxMessages?: number;
};

/**
 * Build a CoreMessage[] from an AgentEvent[] for model consumption.
 *
 * - Extracts messages from user_input, model_response, tool_result events.
 * - Error events are formatted into user-role context for self-healing.
 * - System prompt is prepended as the first message if provided.
 * - maxMessages applies tail windowing (keeps system + most recent N).
 */
export function buildContext(
	events: AgentEvent[],
	options?: BuildContextOptions,
): CoreMessage[] {
	const messages: CoreMessage[] = [];

	for (const event of events) {
		switch (event.type) {
			case 'user_input': {
				messages.push(event.message);
				break;
			}

			case 'model_response': {
				messages.push({role: 'assistant', content: event.result.content});
				break;
			}

			case 'tool_result': {
				messages.push({
					role: 'tool',
					content: event.result.content,
					toolCallId: event.result.toolCallId,
				});
				break;
			}

			case 'error': {
				messages.push({
					role: 'user',
					content: `[Agent Error] ${formatForContext(event.error)}`,
				});
				break;
			}

			default: {
				// Skip tool_call, human_contact, done — no message contribution
				break;
			}
		}
	}

	// Apply tail windowing if maxMessages is specified
	const windowed
		= options?.maxMessages !== undefined && messages.length > options.maxMessages
			? messages.slice(-options.maxMessages)
			: messages;

	// Prepend system prompt if provided
	if (options?.systemPrompt) {
		const systemMessage: CoreMessage = {
			role: 'system',
			content: options.systemPrompt,
		};
		return [systemMessage, ...windowed];
	}

	return windowed;
}

/**
 * Estimate the approximate token count for a message array.
 * Uses a rough heuristic of ~4 characters per token.
 */
export function estimateTokens(messages: CoreMessage[]): number {
	let totalChars = 0;
	for (const message of messages) {
		totalChars += message.content.length;
		if (message.name) {
			totalChars += message.name.length;
		}

		if (message.toolCallId) {
			totalChars += message.toolCallId.length;
		}

		// Overhead for role and message structure
		totalChars += message.role.length + 10;
	}

	return Math.ceil(totalChars / 4);
}
