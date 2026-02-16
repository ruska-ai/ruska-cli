/**
 * Framework-agnostic bash consent middleware.
 * Routes bash command approval through the core middleware system
 * instead of being hardcoded into React hooks.
 */

import {
	validateCommand,
	assessCommandRisk,
} from '../lib/local-tools/security.js';
import {type CommandRisk} from '../lib/local-tools/types.js';
import {type Middleware} from './middleware.js';
import {type ToolCall} from './schemas.js';

/**
 * Decision returned by a ConsentHandler.
 */
export type ConsentDecision =
	| {approved: true}
	| {approved: false; reason: string};

/**
 * Handler called to request user consent for a bash command.
 * The implementation decides how to prompt — TUI dialog, auto-approve, etc.
 */
export type ConsentHandler = (
	command: string,
	risk: CommandRisk,
	warnings: string[],
) => Promise<ConsentDecision>;

/**
 * Creates a middleware that intercepts bash tool calls for consent.
 *
 * - Blocked commands (per validateCommand()) return false immediately.
 * - Non-blocked commands delegate approval to the provided ConsentHandler.
 * - Non-bash tools pass through without calling the handler.
 */
export function createBashConsentMiddleware(
	handler: ConsentHandler,
): Middleware {
	return {
		name: 'bash-consent',
		async beforeToolExecution(toolCall: ToolCall) {
			// Non-bash tools pass through
			if (toolCall.name !== 'bash') {
				return true;
			}

			const command = String(toolCall.args['command'] ?? '');

			// Check if command is blocked
			const validation = validateCommand(command);
			if (!validation.valid) {
				return false;
			}

			// Assess risk and get warnings
			const risk = assessCommandRisk(command);
			const {warnings} = validation;

			// Delegate to consent handler
			const decision = await handler(command, risk, warnings);
			return decision.approved;
		},
	};
}
