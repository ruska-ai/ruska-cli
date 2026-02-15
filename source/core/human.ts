/**
 * Human Contact Tool — models human interaction as a structured tool
 * so the agent can request human input through the standard tool interface.
 */

import {
	type HumanContactRequest,
	type ToolDefinition,
	humanContactRequestSchema,
} from './schemas.js';

/**
 * Handler type for human contact requests.
 */
export type HumanContactHandler = (
	request: HumanContactRequest,
) => Promise<string>;

/**
 * Tool definition for the contact_human tool.
 */
export const humanContactToolDefinition: ToolDefinition = {
	name: 'contact_human',
	description:
		'Request input or assistance from a human operator. Use when the agent needs clarification, approval, or cannot proceed autonomously.',
	parameters: {
		message: {
			type: 'string',
			description: 'The message or question for the human operator',
			required: true,
		},
		context: {
			type: 'string',
			description: 'Additional context to help the human understand the request',
		},
		urgency: {
			type: 'string',
			description: 'Urgency level: low, medium, or high',
		},
	},
};

/**
 * Parses and validates LLM output into a HumanContactRequest.
 * Throws a descriptive Zod error if validation fails.
 */
export function parseHumanContactArgs(
	args: Record<string, unknown>,
): HumanContactRequest {
	return humanContactRequestSchema.parse(args);
}
