/**
 * Chat command for streaming LLM responses
 * Implements Golden Path: Beta architecture + Gamma output + Alpha timeout
 */

import process from 'node:process';
import React, {useState, useEffect, useRef, useCallback} from 'react';
import {render, Text, Box, useApp} from 'ink';
import Spinner from 'ink-spinner';
import {
	extractContent,
	type Config,
	type StreamRequest,
	type ValuesPayload,
} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {OutputFormatter} from '../lib/output/formatter.js';
import {classifyError, exitCodes} from '../lib/output/error-handler.js';
import {writeJson, checkIsTty} from '../lib/output/writers.js';
import {
	StreamService,
	StreamConnectionError,
} from '../lib/services/stream-service.js';
import {truncate, type TruncateOptions} from '../lib/output/truncate.js';
import {parseToolsFlag, buildToolsArray} from '../lib/tools.js';
import {
	BashConsentPrompt,
	BashResultDisplay,
} from '../components/bash-consent-prompt.js';
import {defaultTimeoutMs, type BashToolResult} from '../lib/local-tools/index.js';
import {
	type AgentEvent,
	type AgentState,
	type ConsentDecision,
	createAgentRunner,
} from '../core/index.js';
import type {CommandRisk} from '../lib/local-tools/types.js';

type ChatCommandProperties = {
	readonly message: string;
	readonly isJsonMode: boolean;
	readonly assistantId?: string;
	readonly threadId?: string;
	readonly tools?: string[];
	readonly truncateOptions?: TruncateOptions;
	readonly isBashEnabled?: boolean;
	readonly isAutoApprove?: boolean;
	readonly bashTimeout?: number;
};

type TuiStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

/**
 * Pending consent prompt state — bridges core middleware to React UI.
 */
type ConsentPromptState = {
	command: string;
	risk: CommandRisk;
	warnings: string[];
	resolve: (decision: ConsentDecision) => void;
};

/**
 * Status indicator component for TUI mode
 */
function StatusIndicator({status}: {readonly status: TuiStatus}) {
	switch (status) {
		case 'connecting': {
			return (
				<Box>
					<Text color="cyan">
						<Spinner type="dots" />
					</Text>
					<Text> Connecting...</Text>
				</Box>
			);
		}

		case 'streaming': {
			return (
				<Box>
					<Text color="green">
						<Spinner type="dots" />
					</Text>
					<Text> Streaming...</Text>
				</Box>
			);
		}

		default: {
			return null;
		}
	}
}

/**
 * TUI mode chat command — uses the core agent runner.
 * Presentation components (BashConsentPrompt, BashResultDisplay) are pure UI.
 * All orchestration logic is delegated to createAgentRunner / runAgentStream.
 */
function ChatCommandTui({
	message,
	assistantId,
	threadId,
	truncateOptions,
	isBashEnabled = false,
	isAutoApprove = false,
	bashTimeout = defaultTimeoutMs,
}: Omit<ChatCommandProperties, 'isJsonMode' | 'tools'>) {
	const {exit} = useApp();
	const [config, setConfig] = useState<Config | undefined>();
	const [authError, setAuthError] = useState(false);

	// Agent event stream state
	const [status, setStatus] = useState<TuiStatus>('idle');
	const [responseContent, setResponseContent] = useState('');
	const [errorMessage, setErrorMessage] = useState<string | undefined>();

	// Bash result display — tool_result content shown as stdout
	const [bashResults, setBashResults] = useState<
		Array<{command: string; result: BashToolResult}>
	>([]);

	// Consent prompt bridge: core middleware sets this; React UI resolves the Promise
	const [consentPrompt, setConsentPrompt] = useState<
		ConsentPromptState | undefined
	>();

	// Ref to track whether the component is still mounted
	const mountedReference = useRef(true);
	useEffect(() => () => {
		mountedReference.current = false;
	}, []);

	// Track tool_call args by ID for correlating with tool_result
	const toolCallMapReference = useRef(new Map<string, Record<string, unknown>>());

	// Load config on mount
	useEffect(() => {
		void loadConfig().then(cfg => {
			if (mountedReference.current) {
				if (cfg) {
					setConfig(cfg);
				} else {
					setAuthError(true);
					setTimeout(() => {
						exit();
					}, 100);
				}
			}
		});
	}, [exit]);

	// Consent callbacks
	const handleApprove = useCallback(() => {
		if (consentPrompt) {
			consentPrompt.resolve({approved: true});
			setConsentPrompt(undefined);
		}
	}, [consentPrompt]);

	const handleDeny = useCallback(() => {
		if (consentPrompt) {
			consentPrompt.resolve({approved: false, reason: 'User denied execution'});
			setConsentPrompt(undefined);
		}
	}, [consentPrompt]);

	// Process a single agent event — updates React state
	const processEvent = useCallback((event: AgentEvent) => {
		switch (event.type) {
			case 'model_response': {
				setResponseContent(prev => prev + event.result.content);
				break;
			}

			case 'tool_call': {
				// Track tool_call args for later correlation with tool_result
				toolCallMapReference.current.set(event.toolCall.id, event.toolCall.args);
				break;
			}

			case 'tool_result': {
				if (!event.result.isError) {
					const args = toolCallMapReference.current.get(event.result.toolCallId);
					const command = args ? String(args['command'] ?? '') : '';
					if (command) {
						setBashResults(prev => [
							...prev,
							{
								command,
								result: {
									stdout: event.result.content,
									stderr: '',
									exitCode: 0,
									timedOut: false,
									truncated: false,
									executionTimeMs: 0,
								},
							},
						]);
					}
				}

				break;
			}

			case 'error': {
				setErrorMessage(event.error.message);
				break;
			}

			default: {
				break;
			}
		}
	}, []);

	// Run agent when config is ready
	useEffect(() => {
		if (!config) return;

		const service = new StreamService(config);
		let cancelled = false;

		const run = async () => {
			if (!mountedReference.current) return;
			setStatus('connecting');

			try {
				const runner = await createAgentRunner({
					input: message,
					service,
					systemPrompt: 'You are a helpful assistant.',
					maxIterations: 10,
					maxErrors: 3,
					enableBash: isBashEnabled,
					autoApprove: isAutoApprove,
					bashTimeout,
					model: undefined,
					assistantId,
					threadId,
					consentHandler: isBashEnabled && !isAutoApprove
						? async (command, risk, warnings) =>
							new Promise<ConsentDecision>(resolve => {
								if (mountedReference.current) {
									setConsentPrompt({command, risk, warnings, resolve});
								}
							})
						: undefined,
				});

				if (cancelled) return;
				setStatus('streaming');

				// Consume the async generator
				let done = false;
				while (!done) {
					if (cancelled) break;
					// eslint-disable-next-line no-await-in-loop
					const result = await runner.next();
					if (result.done) {
						done = true;
						if (!cancelled && mountedReference.current) {
							const finalState: AgentState = result.value;
							setStatus(finalState.status === 'error' ? 'error' : 'done');
						}
					} else {
						processEvent(result.value);
					}
				}
			} catch (error: unknown) {
				if (!cancelled && mountedReference.current) {
					setErrorMessage(
						error instanceof Error ? error.message : 'Unknown error',
					);
					setStatus('error');
				}
			}
		};

		void run();

		return () => {
			cancelled = true;
		};
	}, [config, message, assistantId, threadId, isBashEnabled, isAutoApprove, bashTimeout, processEvent]);

	// Exit on completion
	useEffect(() => {
		if (status === 'done' || status === 'error') {
			if (consentPrompt) return; // Waiting for consent
			setTimeout(() => {
				exit();
			}, 100);
		}
	}, [status, exit, consentPrompt]);

	// Auth error
	if (authError) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">Not authenticated.</Text>
				<Text>
					Run <Text bold>ruska auth</Text> to configure.
				</Text>
			</Box>
		);
	}

	// Stream error
	if (status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Error: {errorMessage ?? 'Unknown error'}</Text>
			</Box>
		);
	}

	// Render TUI
	return (
		<Box flexDirection="column">
			<StatusIndicator status={status} />

			{/* Assistant response content */}
			{responseContent && (
				<Box marginTop={1} flexDirection="column">
					{truncateOptions ? (
						(() => {
							const truncated = truncate(responseContent, truncateOptions);
							return (
								<>
									<Text>{truncated.text}</Text>
									{truncated.wasTruncated && (
										<Text dimColor color="yellow">
											(use --full-output for full output)
										</Text>
									)}
								</>
							);
						})()
					) : (
						<Text>{responseContent}</Text>
					)}
				</Box>
			)}

			{/* Bash execution results */}
			{bashResults.map((bashResult, index) => (
				<Box key={`bash-${String(index)}`} marginTop={1}>
					<BashResultDisplay
						command={bashResult.command}
						exitCode={bashResult.result.exitCode}
						stdout={bashResult.result.stdout}
						stderr={bashResult.result.stderr}
						isTimedOut={bashResult.result.timedOut}
						executionTimeMs={bashResult.result.executionTimeMs}
					/>
				</Box>
			))}

			{/* Bash consent prompt */}
			{consentPrompt && (
				<Box marginTop={1}>
					<BashConsentPrompt
						command={consentPrompt.command}
						risk={consentPrompt.risk}
						warnings={consentPrompt.warnings}
						onApprove={handleApprove}
						onDeny={handleDeny}
					/>
				</Box>
			)}

			{/* Done indicator */}
			{status === 'done' && !consentPrompt && (
				<Box marginTop={1} flexDirection="column">
					<Text color="green">Done</Text>
					{threadId && <Text dimColor>Thread: {threadId}</Text>}
					{threadId && (
						<Text dimColor>
							Continue: ruska chat -t {threadId} &quot;message&quot;
						</Text>
					)}
				</Box>
			)}
		</Box>
	);
}

/**
 * JSON mode chat command - direct streaming without React hooks
 * Outputs NDJSON for downstream consumption
 */
async function runJsonMode(
	message: string,
	assistantId?: string,
	threadId?: string,
	tools?: string[],
): Promise<void> {
	const config = await loadConfig();

	if (!config) {
		const formatter = new OutputFormatter();
		writeJson(
			formatter.error(
				'AUTH_FAILED',
				'Not authenticated. Run `ruska auth` to configure.',
			),
		);
		process.exitCode = exitCodes.authFailed;
		return;
	}

	const service = new StreamService(config);
	const formatter = new OutputFormatter();
	let finalResponse: ValuesPayload | undefined;

	try {
		// Snake_case properties match backend API
		/* eslint-disable @typescript-eslint/naming-convention */
		const request: StreamRequest = {
			input: {messages: [{role: 'user', content: message}]},
			tools,
			metadata: {
				...(assistantId && {assistant_id: assistantId}),
				...(threadId && {thread_id: threadId}),
			},
		};
		/* eslint-enable @typescript-eslint/naming-convention */

		const handle = await service.connect(request);

		for await (const event of handle.events) {
			switch (event.type) {
				case 'messages': {
					// Output content chunks as NDJSON
					const text = extractContent(event.payload[0]?.content);

					if (text) {
						writeJson(formatter.chunk(text));
					}

					// NOTE: Ignoring tool_calls per requirements
					break;
				}

				case 'values': {
					// CRITICAL: Capture complete response
					finalResponse = event.payload;
					break;
				}

				case 'error': {
					writeJson(formatter.error('SERVER_ERROR', event.payload.message));
					process.exitCode = exitCodes.serverError;
					return;
				}

				default: {
					// Unknown event type - ignore
					break;
				}
			}
		}

		// Output final done event with complete response
		if (finalResponse) {
			writeJson(formatter.done(finalResponse));
		} else {
			// No values event received - output minimal done event
			writeJson(formatter.done({messages: []}));
		}

		process.exitCode = exitCodes.success;
	} catch (error: unknown) {
		const statusCode =
			error instanceof StreamConnectionError ? error.statusCode : undefined;
		const classified = classifyError(error, statusCode);
		writeJson(formatter.error(classified.code, classified.message));
		process.exitCode = classified.exitCode;
	}
}

/**
 * Main chat command component - handles JSON mode branching
 */
function ChatCommand({
	message,
	isJsonMode,
	assistantId,
	threadId,
	tools,
	truncateOptions,
	isBashEnabled,
	isAutoApprove,
	bashTimeout,
}: ChatCommandProperties) {
	const {exit} = useApp();

	useEffect(() => {
		if (isJsonMode) {
			// JSON mode runs outside React, just exit immediately
			void runJsonMode(message, assistantId, threadId, tools).finally(() => {
				exit();
			});
		}
	}, [message, isJsonMode, assistantId, threadId, tools, exit]);

	// JSON mode: no UI (handled in useEffect)
	if (isJsonMode) {
		return null;
	}

	// TUI mode — core runner handles tools internally
	return (
		<ChatCommandTui
			message={message}
			assistantId={assistantId}
			threadId={threadId}
			truncateOptions={truncateOptions}
			isBashEnabled={isBashEnabled}
			isAutoApprove={isAutoApprove}
			bashTimeout={bashTimeout}
		/>
	);
}

/**
 * Run the chat command
 */
export async function runChatCommand(
	message: string,
	options: {
		json?: boolean;
		assistantId?: string;
		threadId?: string;
		tools?: string;
		truncateOptions?: TruncateOptions;
		enableBash?: boolean;
		autoApprove?: boolean;
		bashTimeout?: number;
	} = {},
): Promise<void> {
	// Auto-detect: use JSON mode if not TTY (piped) or explicitly requested
	const isJsonMode = options.json ?? !checkIsTty();

	// Parse tools flag (undefined = defaults, 'disabled' = [], 'a,b' = ['a', 'b'])
	const parsedTools = parseToolsFlag(options.tools);

	// Build tools array with bash_tool if enabled
	const tools = buildToolsArray(options.enableBash ?? false, parsedTools);

	const {waitUntilExit} = render(
		<ChatCommand
			message={message}
			isJsonMode={isJsonMode}
			assistantId={options.assistantId}
			threadId={options.threadId}
			tools={tools}
			truncateOptions={options.truncateOptions}
			isBashEnabled={options.enableBash}
			isAutoApprove={options.autoApprove}
			bashTimeout={options.bashTimeout}
		/>,
	);
	await waitUntilExit();
}
