/**
 * Type definitions for local bash tool execution
 * @module local-tools/types
 */

/**
 * Request to execute a bash command locally
 */
export type BashToolRequest = {
	/** The bash command to execute */
	command: string;
	/** Working directory for command execution (defaults to cwd) */
	cwd?: string;
	/** Timeout in milliseconds (defaults to defaultTimeoutMs) */
	timeout?: number;
};

/**
 * Result of executing a bash command
 */
export type BashToolResult = {
	/** Standard output from the command */
	stdout: string;
	/** Standard error from the command */
	stderr: string;
	/** Exit code of the process (0 = success) */
	exitCode: number;
	/** Whether the command was killed due to timeout */
	timedOut: boolean;
	/** Whether output was truncated due to size limits */
	truncated: boolean;
	/** Actual execution time in milliseconds */
	executionTimeMs: number;
};

/**
 * Options for bash execution
 */
export type BashExecutionOptions = {
	/** The bash command to execute */
	command: string;
	/** Working directory for command execution */
	cwd?: string;
	/** Timeout in milliseconds */
	timeout?: number;
	/** Maximum output size in bytes */
	maxOutput?: number;
};

/**
 * Default timeout for bash command execution (30 seconds)
 */
export const defaultTimeoutMs = 30_000;

/**
 * Maximum output size to capture (1MB)
 * Prevents memory exhaustion from large outputs
 */
export const maxOutputSize = 1_048_576;

/**
 * Commands that are always blocked due to high risk of system damage
 * These patterns will auto-deny without prompting the user
 */
export const blockedCommands: readonly string[] = [
	// Catastrophic deletion patterns
	'rm -rf /',
	'rm -rf /*',
	'rm -rf ~',
	'rm -rf ~/*',
	'rm -rf .',
	'rm -rf ./*',
	'rm -rf $HOME',
	'rm -rf "$HOME"',
	// Fork bombs
	':(){ :|:& };:',
	'fork()',
	// Pipe to shell (potential for downloading and executing malicious code)
	'curl|sh',
	'curl|bash',
	'wget|sh',
	'wget|bash',
	'curl | sh',
	'curl | bash',
	'wget | sh',
	'wget | bash',
	// Direct disk writes
	'> /dev/sda',
	'> /dev/hda',
	'> /dev/nvme',
	'dd if=/dev/zero of=/dev/sda',
	'dd if=/dev/zero of=/dev/hda',
	// System critical file overwrites
	'> /etc/passwd',
	'> /etc/shadow',
	'> /etc/sudoers',
	// Dangerous chmod patterns
	'chmod -R 777 /',
	'chmod -R 777 /*',
] as const;

/**
 * Patterns that trigger warnings but are not auto-blocked
 * User will see elevated warnings for these commands
 */
export const warningPatterns: readonly RegExp[] = [
	// Sudo commands require elevated privileges
	/\bsudo\b/,
	// Potentially dangerous file permission changes
	/chmod\s+777/,
	/chmod\s+-R/,
	// Parent directory recursive deletion
	/rm\s+-rf*\s+\.\./,
	/rm\s+-[a-z]*r[a-z]*\s+\.\./,
	// System directories
	/rm\s+.*\/etc\//,
	/rm\s+.*\/usr\//,
	/rm\s+.*\/var\//,
	/rm\s+.*\/bin\//,
	/rm\s+.*\/sbin\//,
	// Credential/config file access
	/cat\s+.*\.env/,
	/cat\s+.*\.ssh\//,
	/cat\s+.*credentials/i,
	/cat\s+.*\.aws\//,
	// Git force operations
	/git\s+push\s+.*--force/,
	/git\s+push\s+-f\b/,
	/git\s+reset\s+--hard/,
	// Package manager system-wide operations
	/npm\s+.*-g\b/,
	/pip\s+install\s+--system/,
	/apt\s+remove/,
	/apt-get\s+remove/,
	/yum\s+remove/,
	// Process killing
	/kill\s+-9/,
	/killall/,
	/pkill/,
] as const;

/**
 * Command risk levels for display purposes
 */
export type CommandRisk = 'safe' | 'moderate' | 'dangerous';

/**
 * Result of command validation
 */
export type ValidationResult =
	| {valid: true; warnings: string[]}
	| {valid: false; reason: string};
