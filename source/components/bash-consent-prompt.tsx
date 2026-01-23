/**
 * React-Ink component for bash command consent prompt
 * Displays command for user approval with warnings and keyboard handling
 * @module components/bash-consent-prompt
 */

import React from 'react';
import {Text, Box, useInput} from 'ink';
import type {CommandRisk} from '../lib/local-tools/index.js';

export type BashConsentPromptProperties = {
	/** The bash command requiring approval */
	readonly command: string;
	/** Risk level of the command */
	readonly risk: CommandRisk;
	/** Warning messages to display */
	readonly warnings: readonly string[];
	/** Callback when user approves the command */
	readonly onApprove: () => void;
	/** Callback when user denies the command */
	readonly onDeny: () => void;
};

/**
 * Consent prompt component for bash command execution
 *
 * Displays:
 * - Command in cyan with yellow border
 * - Warnings in red if present
 * - y/N prompt with default deny
 *
 * Keyboard handling:
 * - y/Y: Approve command
 * - n/N/Escape/Enter: Deny command (default)
 */
export function BashConsentPrompt({
	command,
	risk,
	warnings,
	onApprove,
	onDeny,
}: BashConsentPromptProperties) {
	useInput((input, key) => {
		if (input.toLowerCase() === 'y') {
			onApprove();
		} else if (
			input.toLowerCase() === 'n' ||
			key.escape ||
			key.return // Enter defaults to deny
		) {
			onDeny();
		}
	});

	// Determine border color based on risk
	const borderColor = risk === 'dangerous' ? 'red' : 'yellow';
	const riskLabel =
		risk === 'dangerous' ? 'DANGEROUS' : risk === 'moderate' ? 'WARNING' : '';

	return (
		<Box
			borderColor={borderColor}
			borderStyle="round"
			flexDirection="column"
			paddingX={1}
		>
			{/* Header */}
			<Box marginBottom={1}>
				<Text bold color={borderColor}>
					Bash Command Approval Required
				</Text>
				{riskLabel && <Text color={borderColor}> [{riskLabel}]</Text>}
			</Box>

			{/* Command display */}
			<Box marginBottom={1}>
				<Text dimColor>Command: </Text>
				<Text color="cyan" wrap="wrap">
					{command}
				</Text>
			</Box>

			{/* Warnings section */}
			{warnings.length > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					<Text bold color="red">
						Warnings:
					</Text>
					{warnings.map(warning => (
						<Box key={warning} marginLeft={2}>
							<Text color="red">• {warning}</Text>
						</Box>
					))}
				</Box>
			)}

			{/* Prompt */}
			<Box>
				<Text>Execute this command? </Text>
				<Text bold color="green">
					y
				</Text>
				<Text>/</Text>
				<Text bold color="red">
					N
				</Text>
				<Text dimColor> (default: deny)</Text>
			</Box>
		</Box>
	);
}

/**
 * Component to display that a command was auto-blocked
 */
export type BashBlockedPromptProperties = {
	/** The blocked command */
	readonly command: string;
	/** Reason for blocking */
	readonly reason: string;
};

export function BashBlockedPrompt({
	command,
	reason,
}: BashBlockedPromptProperties) {
	return (
		<Box
			borderColor="red"
			borderStyle="round"
			flexDirection="column"
			paddingX={1}
		>
			<Box marginBottom={1}>
				<Text bold color="red">
					Command Blocked
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Command: </Text>
				<Text strikethrough color="red">
					{command}
				</Text>
			</Box>

			<Box>
				<Text dimColor>Reason: </Text>
				<Text color="red">{reason}</Text>
			</Box>
		</Box>
	);
}

/**
 * Component to display bash execution result
 */
export type BashResultDisplayProperties = {
	/** The command that was executed */
	readonly command: string;
	/** Exit code */
	readonly exitCode: number;
	/** Standard output */
	readonly stdout: string;
	/** Standard error */
	readonly stderr: string;
	/** Whether the command timed out */
	readonly isTimedOut: boolean;
	/** Execution time in ms */
	readonly executionTimeMs: number;
};

export function BashResultDisplay({
	command,
	exitCode,
	stdout,
	stderr,
	isTimedOut,
	executionTimeMs,
}: BashResultDisplayProperties) {
	const success = exitCode === 0;
	const statusColor = success ? 'green' : 'red';
	const statusIcon = success ? '✓' : '✗';

	return (
		<Box
			borderColor={statusColor}
			borderStyle="single"
			flexDirection="column"
			paddingX={1}
		>
			{/* Header */}
			<Box marginBottom={1}>
				<Text bold color={statusColor}>
					{statusIcon} Bash Execution Result
				</Text>
				{isTimedOut && <Text color="yellow"> [TIMED OUT]</Text>}
			</Box>

			{/* Command echo */}
			<Box marginBottom={1}>
				<Text dimColor>$ </Text>
				<Text color="cyan">{command}</Text>
			</Box>

			{/* Exit code and time */}
			<Box marginBottom={1}>
				<Text dimColor>Exit: </Text>
				<Text color={statusColor}>{exitCode}</Text>
				<Text dimColor> | Time: {executionTimeMs}ms</Text>
			</Box>

			{/* stdout */}
			{stdout && (
				<Box flexDirection="column" marginBottom={1}>
					<Text dimColor>─── stdout ───</Text>
					<Text>{stdout}</Text>
				</Box>
			)}

			{/* stderr */}
			{stderr && (
				<Box flexDirection="column">
					<Text dimColor>─── stderr ───</Text>
					<Text color="red">{stderr}</Text>
				</Box>
			)}

			{/* No output message */}
			{!stdout && !stderr && <Text dimColor>(No output)</Text>}
		</Box>
	);
}
