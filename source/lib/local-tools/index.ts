/**
 * Local tools module for CLI-side tool execution
 * @module local-tools
 */

// Re-export types
export {
	type BashToolRequest,
	type BashToolResult,
	type BashExecutionOptions,
	type CommandRisk,
	type ValidationResult,
	defaultTimeoutMs,
	maxOutputSize,
	blockedCommands,
	warningPatterns,
} from './types.js';

// Re-export security functions
export {
	validateCommand,
	assessCommandRisk,
	isInteractiveCommand,
} from './security.js';

// Re-export executor functions
export {
	executeBash,
	formatResultForLlm,
	formatDeniedResult,
} from './bash-executor.js';
