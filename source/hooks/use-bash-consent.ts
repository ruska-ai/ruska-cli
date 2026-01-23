/**
 * React hook for managing bash command consent flow
 * Implements a state machine for user approval of local command execution
 * @module hooks/use-bash-consent
 */

import {useState, useCallback} from 'react';
import {
	validateCommand,
	assessCommandRisk,
	type CommandRisk,
} from '../lib/local-tools/index.js';

/**
 * Consent state when no command is pending
 */
export type ConsentStateIdle = {
	type: 'idle';
};

/**
 * Consent state when waiting for user decision
 */
export type ConsentStatePending = {
	type: 'pending';
	command: string;
	toolCallId: string;
	risk: CommandRisk;
	warnings: string[];
};

/**
 * Consent state after user has made a decision
 */
export type ConsentStateDecided = {
	type: 'decided';
	command: string;
	toolCallId: string;
	response: ConsentResponse;
	reason?: string;
};

/**
 * Consent state when command was auto-denied (blocked)
 */
export type ConsentStateBlocked = {
	type: 'blocked';
	command: string;
	toolCallId: string;
	reason: string;
};

export type ConsentState =
	| ConsentStateIdle
	| ConsentStatePending
	| ConsentStateDecided
	| ConsentStateBlocked;

export type ConsentResponse = 'approved' | 'denied';

export type UseBashConsentResult = {
	/** Current consent state */
	state: ConsentState;
	/** Request user consent for a command */
	requestConsent: (command: string, toolCallId: string) => void;
	/** Approve the pending command */
	approve: () => void;
	/** Deny the pending command */
	deny: (reason?: string) => void;
	/** Reset to idle state */
	reset: () => void;
	/** Check if a command is pending approval */
	isPending: boolean;
	/** Check if a decision was made (approved or denied) */
	isDecided: boolean;
};

/**
 * Hook for managing bash command consent flow
 *
 * State machine:
 * - idle: No command pending
 * - pending: Command awaiting user decision (shows consent prompt)
 * - decided: User approved or denied the command
 * - blocked: Command auto-denied due to blocklist
 *
 * @example
 * const { state, requestConsent, approve, deny, reset } = useBashConsent();
 *
 * // When tool call detected
 * requestConsent('ls -la', 'tool-call-123');
 *
 * // In UI, check state.type and render appropriate UI
 * if (state.type === 'pending') {
 *   // Show consent prompt with state.command, state.warnings
 * }
 */
export function useBashConsent(): UseBashConsentResult {
	const [state, setState] = useState<ConsentState>({type: 'idle'});

	const requestConsent = useCallback((command: string, toolCallId: string) => {
		// Validate command first
		const validation = validateCommand(command);

		if (!validation.valid) {
			// Auto-deny blocked commands without prompting
			setState({
				type: 'blocked',
				command,
				toolCallId,
				reason: validation.reason,
			});
			return;
		}

		// Command is valid, request user consent
		const risk = assessCommandRisk(command);

		setState({
			type: 'pending',
			command,
			toolCallId,
			risk,
			warnings: validation.warnings,
		});
	}, []);

	const approve = useCallback(() => {
		setState(current => {
			if (current.type !== 'pending') {
				return current;
			}

			return {
				type: 'decided',
				command: current.command,
				toolCallId: current.toolCallId,
				response: 'approved',
			};
		});
	}, []);

	const deny = useCallback((reason?: string) => {
		setState(current => {
			if (current.type !== 'pending') {
				return current;
			}

			return {
				type: 'decided',
				command: current.command,
				toolCallId: current.toolCallId,
				response: 'denied',
				reason,
			};
		});
	}, []);

	const reset = useCallback(() => {
		setState({type: 'idle'});
	}, []);

	return {
		state,
		requestConsent,
		approve,
		deny,
		reset,
		isPending: state.type === 'pending',
		isDecided: state.type === 'decided' || state.type === 'blocked',
	};
}
