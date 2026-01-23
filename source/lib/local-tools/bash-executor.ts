/**
 * Bash command executor for local tool execution
 * @module local-tools/bash-executor
 */

import process from 'node:process';
import {spawn} from 'node:child_process';
import {platform} from 'node:os';
import {
	defaultTimeoutMs,
	maxOutputSize,
	type BashExecutionOptions,
	type BashToolResult,
} from './types.js';
import {validateCommand, isInteractiveCommand} from './security.js';

/**
 * Execute a bash command locally with safety controls
 *
 * @param options - Execution options including command, cwd, timeout
 * @returns Promise resolving to execution result
 * @throws Error if command is blocked or on Windows without bash
 *
 * @example
 * const result = await executeBash({ command: 'ls -la' });
 * console.log(result.stdout);
 */
export async function executeBash(
	options: BashExecutionOptions,
): Promise<BashToolResult> {
	const {
		command,
		cwd = process.cwd(),
		timeout = defaultTimeoutMs,
		maxOutput = maxOutputSize,
	} = options;

	const startTime = Date.now();

	// Validate command before execution
	const validation = validateCommand(command);
	if (!validation.valid) {
		return {
			stdout: '',
			stderr: `Command blocked: ${validation.reason}`,
			exitCode: 1,
			timedOut: false,
			truncated: false,
			executionTimeMs: Date.now() - startTime,
		};
	}

	// Check for interactive commands
	if (isInteractiveCommand(command)) {
		return {
			stdout: '',
			stderr:
				'Interactive commands are not supported. This command requires user input which cannot be provided in this environment.',
			exitCode: 1,
			timedOut: false,
			truncated: false,
			executionTimeMs: Date.now() - startTime,
		};
	}

	// Platform check - only support Unix-like systems with bash
	if (platform() === 'win32') {
		return {
			stdout: '',
			stderr:
				'Bash execution is not supported on Windows. Consider using WSL (Windows Subsystem for Linux) or Git Bash.',
			exitCode: 1,
			timedOut: false,
			truncated: false,
			executionTimeMs: Date.now() - startTime,
		};
	}

	return new Promise(resolve => {
		const stdoutChunks: Uint8Array[] = [];
		const stderrChunks: Uint8Array[] = [];
		let stdoutSize = 0;
		let stderrSize = 0;
		let truncated = false;
		let timedOut = false;
		let killed = false;

		// Spawn bash with command
		const child = spawn('bash', ['-c', command], {
			cwd,
			env: {...process.env},
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		// Handle stdout with size limiting
		child.stdout.on('data', (chunk: Uint8Array) => {
			if (stdoutSize + chunk.length <= maxOutput) {
				stdoutChunks.push(chunk);
				stdoutSize += chunk.length;
			} else if (!truncated) {
				// Add partial chunk up to limit
				const remaining = maxOutput - stdoutSize;
				if (remaining > 0) {
					stdoutChunks.push(chunk.subarray(0, remaining));
					stdoutSize = maxOutput;
				}

				truncated = true;
			}
		});

		// Handle stderr with size limiting
		child.stderr.on('data', (chunk: Uint8Array) => {
			if (stderrSize + chunk.length <= maxOutput) {
				stderrChunks.push(chunk);
				stderrSize += chunk.length;
			} else if (!truncated) {
				const remaining = maxOutput - stderrSize;
				if (remaining > 0) {
					stderrChunks.push(chunk.subarray(0, remaining));
					stderrSize = maxOutput;
				}

				truncated = true;
			}
		});

		// Timeout handler with SIGTERM → SIGKILL escalation
		const timeoutId = setTimeout(() => {
			timedOut = true;
			killed = true;

			// Try SIGTERM first (graceful shutdown)
			child.kill('SIGTERM');

			// Force kill after 2 seconds if still running
			setTimeout(() => {
				if (!child.killed) {
					child.kill('SIGKILL');
				}
			}, 2000);
		}, timeout);

		// Handle process completion
		child.on('close', (code, signal) => {
			clearTimeout(timeoutId);

			const stdout = Buffer.concat(stdoutChunks).toString('utf8');
			const stderr = Buffer.concat(stderrChunks).toString('utf8');

			// Add context to stderr if killed
			let finalStderr = stderr;
			if (timedOut) {
				finalStderr =
					`${stderr}\n[Process killed: timeout exceeded (${timeout}ms)]`.trim();
			} else if (killed && signal) {
				finalStderr =
					`${stderr}\n[Process terminated by signal: ${signal}]`.trim();
			}

			resolve({
				stdout,
				stderr: finalStderr,
				exitCode: code ?? (signal ? 128 : 1),
				timedOut,
				truncated,
				executionTimeMs: Date.now() - startTime,
			});
		});

		// Handle spawn errors
		child.on('error', (error_: Error) => {
			clearTimeout(timeoutId);
			resolve({
				stdout: '',
				stderr: `Failed to execute command: ${error_.message}`,
				exitCode: 1,
				timedOut: false,
				truncated: false,
				executionTimeMs: Date.now() - startTime,
			});
		});
	});
}

/**
 * Format a bash execution result for LLM consumption
 *
 * @param result - The execution result to format
 * @returns Formatted string suitable for LLM context
 *
 * @example
 * const result = await executeBash({ command: 'ls -la' });
 * const formatted = formatResultForLlm(result);
 * // "Exit code: 0\n\n--- STDOUT ---\nfile1.txt\nfile2.txt\n"
 */
export function formatResultForLlm(result: BashToolResult): string {
	const parts: string[] = [
		`Exit code: ${result.exitCode}`,
		...(result.timedOut ? ['Status: TIMED OUT'] : []),
		...(result.truncated
			? ['Note: Output was truncated due to size limits']
			: []),
		`Execution time: ${result.executionTimeMs}ms`,
		'',
	];

	// Stdout section
	if (result.stdout) {
		parts.push('--- STDOUT ---', result.stdout, '');
	}

	// Stderr section
	if (result.stderr) {
		parts.push('--- STDERR ---', result.stderr, '');
	}

	// Empty output message
	if (!result.stdout && !result.stderr) {
		parts.push('(No output)');
	}

	return parts.join('\n').trim();
}

/**
 * Format a denied command result for LLM consumption
 *
 * @param command - The command that was denied
 * @param reason - The reason for denial (optional)
 * @returns Formatted string informing LLM of denial
 */
export function formatDeniedResult(command: string, reason?: string): string {
	const parts = [
		'Command execution was DENIED by the user.',
		'',
		`Command: ${command}`,
		...(reason ? [`Reason: ${reason}`] : []),
		'',
		'Please suggest an alternative approach or ask the user for guidance.',
	];

	return parts.join('\n');
}
