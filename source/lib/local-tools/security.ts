/**
 * Security module for bash command validation
 * @module local-tools/security
 */

import {
	blockedCommands,
	warningPatterns,
	type CommandRisk,
	type ValidationResult,
} from './types.js';

/**
 * Normalize a command string for comparison
 * Removes extra whitespace and converts to lowercase for pattern matching
 */
function normalizeCommand(command: string): string {
	// eslint-disable-next-line unicorn/prefer-string-replace-all
	return command.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Check if command matches any blocked pattern
 */
function matchesBlockedPattern(command: string): string | undefined {
	const normalized = normalizeCommand(command);

	for (const blocked of blockedCommands) {
		const normalizedBlocked = normalizeCommand(blocked);
		if (normalized.includes(normalizedBlocked)) {
			return blocked;
		}
	}

	// Additional heuristic checks for fork bomb variations
	if (/:\(\)\s*{.*\|.*&\s*}.*:/.test(command)) {
		return 'fork bomb pattern';
	}

	// Check for pipe-to-shell patterns with URLs
	if (/\b(curl|wget)\b.*\|\s*(sh|bash|zsh)/.test(command)) {
		return 'pipe to shell pattern';
	}

	// Check for destructive dd commands
	if (/\bdd\b.*of=\/dev\/[a-z]+/.test(command)) {
		return 'direct disk write';
	}

	return undefined;
}

/**
 * Get warnings for potentially risky commands
 */
function getCommandWarnings(command: string): string[] {
	const warnings: string[] = [];

	for (const pattern of warningPatterns) {
		if (pattern.test(command)) {
			// Generate human-readable warning based on pattern
			if (/\bsudo\b/.test(command)) {
				warnings.push('Uses sudo - requires elevated privileges');
			} else if (/chmod\s+777/.test(command)) {
				warnings.push(
					'chmod 777 makes files world-readable/writable/executable',
				);
			} else if (/rm\s+-r/.test(command)) {
				warnings.push('Recursive deletion - verify target carefully');
			} else if (/git\s+(push.*--force|reset\s+--hard)/.test(command)) {
				warnings.push('Destructive git operation - may lose commits');
			} else if (/kill|pkill|killall/.test(command)) {
				warnings.push('Process termination command');
			} else if (/\.(env|ssh|credentials|aws)/i.test(command)) {
				warnings.push('Accesses potentially sensitive files');
			} else if (/apt|yum|npm\s+-g|pip.*--system/.test(command)) {
				warnings.push('System-wide package operation');
			} else {
				warnings.push(`Matches warning pattern: ${pattern.source}`);
			}
		}
	}

	// Deduplicate warnings
	return [...new Set(warnings)];
}

/**
 * Validate a command for execution safety
 *
 * @param command - The bash command to validate
 * @returns Validation result with either approval + warnings, or rejection + reason
 *
 * @example
 * validateCommand('ls -la')
 * // { valid: true, warnings: [] }
 *
 * validateCommand('rm -rf /')
 * // { valid: false, reason: 'Blocked: rm -rf /' }
 *
 * validateCommand('sudo apt update')
 * // { valid: true, warnings: ['Uses sudo - requires elevated privileges'] }
 */
export function validateCommand(command: string): ValidationResult {
	// Check for empty command
	if (!command || command.trim() === '') {
		return {valid: false, reason: 'Empty command'};
	}

	// Check against blocklist
	const blockedMatch = matchesBlockedPattern(command);
	if (blockedMatch) {
		return {valid: false, reason: `Blocked: ${blockedMatch}`};
	}

	// Get warnings for risky patterns
	const warnings = getCommandWarnings(command);

	return {valid: true, warnings};
}

/**
 * Assess the overall risk level of a command
 *
 * @param command - The bash command to assess
 * @returns Risk level: 'safe', 'moderate', or 'dangerous'
 *
 * @example
 * assessCommandRisk('ls -la')        // 'safe'
 * assessCommandRisk('sudo apt update') // 'moderate'
 * assessCommandRisk('rm -rf /')      // 'dangerous'
 */
export function assessCommandRisk(command: string): CommandRisk {
	const validation = validateCommand(command);

	// Blocked commands are dangerous
	if (!validation.valid) {
		return 'dangerous';
	}

	// Commands with warnings are moderate risk
	if (validation.warnings.length > 0) {
		return 'moderate';
	}

	// No issues detected
	return 'safe';
}

/**
 * Check if a command appears to be interactive (would require user input)
 * These commands may hang waiting for input
 */
export function isInteractiveCommand(command: string): boolean {
	const interactivePatterns = [
		/\bvim?\b/,
		/\bnano\b/,
		/\bemacs\b/,
		/\bless\b(?!\s+-)/,
		/\bmore\b(?!\s+-)/,
		/\bread\b\s+-p/,
		/\bssh\b(?!.*-o\s*BatchMode)/,
		/\bsudo\s+-S/,
		/\bpasswd\b/,
		/\btop\b$/,
		/\bhtop\b$/,
	];

	return interactivePatterns.some(pattern => pattern.test(command));
}
