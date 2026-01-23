/**
 * Chat command for streaming LLM responses
 * Implements Golden Path: Beta architecture + Gamma output + Alpha timeout
 */

import process from 'node:process';
import React, {useState, useEffect, useMemo} from 'react';
import {render, Text, Box, useApp} from 'ink';
import Spinner from 'ink-spinner';
import {
	extractContent,
	type Config,
	type MessagePayload,
	type StreamEvent,
	type StreamRequest,
	type ValuesPayload,
} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {useStream, type StreamStatus} from '../hooks/use-stream.js';
import {OutputFormatter} from '../lib/output/formatter.js';
import {classifyError, exitCodes} from '../lib/output/error-handler.js';
import {writeJson, checkIsTty} from '../lib/output/writers.js';
import {
	StreamService,
	StreamConnectionError,
} from '../lib/services/stream-service.js';
import {truncate, type TruncateOptions} from '../lib/output/truncate.js';
import {parseToolsFlag, buildToolsArray, isLocalTool} from '../lib/tools.js';
import {useBashConsent} from '../hooks/use-bash-consent.js';
import {
	BashConsentPrompt,
	BashBlockedPrompt,
	BashResultDisplay,
} from '../components/bash-consent-prompt.js';
import {
	executeBash,
	formatResultForLlm,
	formatDeniedResult,
	defaultTimeoutMs,
	type BashToolResult,
} from '../lib/local-tools/index.js';

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

/**
 * A message block groups consecutive messages with the same type + name
 */
type MessageBlock = {
	id: string;
	type: string | undefined;
	name: string | undefined;
	content: string;
};

/**
 * Group messages into blocks by type + name boundaries
 */
function groupMessagesIntoBlocks(messages: MessagePayload[]): MessageBlock[] {
	const blocks: MessageBlock[] = [];

	for (const message of messages) {
		const text = extractContent(message.content);
		if (!text) continue;

		const currentBlock = blocks[blocks.length - 1];

		// Check if this message continues the current block (same type + name)
		if (
			currentBlock &&
			currentBlock.type === message.type &&
			currentBlock.name === message.name
		) {
			currentBlock.content += text;
		} else {
			// Start a new block with a stable id
			const blockId = `${message.type ?? 'msg'}-${message.name ?? 'default'}-${
				blocks.length
			}`;
			blocks.push({
				id: blockId,
				type: message.type,
				name: message.name,
				content: text,
			});
		}
	}

	return blocks;
}

/**
 * Extract model name from stream events
 */
function extractModelFromEvents(events: StreamEvent[]): string | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (event?.type === 'messages') {
			const message = event.payload[0];
			const modelName = message?.response_metadata?.['model_name'];
			if (modelName) return String(modelName);
		}
	}

	return undefined;
}

/**
 * Status indicator component for TUI mode
 */
function StatusIndicator({status}: {readonly status: StreamStatus}) {
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
 * TUI mode chat command using React hook
 */
function ChatCommandTui({
	message,
	assistantId,
	threadId,
	tools,
	truncateOptions,
	isBashEnabled = false,
	isAutoApprove = false,
	bashTimeout = defaultTimeoutMs,
}: Omit<ChatCommandProperties, 'isJsonMode'>) {
	const {exit} = useApp();
	const [config, setConfig] = useState<Config | undefined>();
	const [authError, setAuthError] = useState(false);

	// Bash consent state
	const bashConsent = useBashConsent();

	// Track pending bash tool call
	const [pendingBashCall, setPendingBashCall] = useState<
		{id: string; command: string} | undefined
	>(undefined);

	// Track bash execution results for display
	const [bashResults, setBashResults] = useState<
		Array<{command: string; result: BashToolResult}>
	>([]);

	// Track processed tool call IDs to avoid re-processing
	const [processedToolCalls, setProcessedToolCalls] = useState<Set<string>>(
		new Set(),
	);

	// Track conversation continuation request
	const [continuationRequest, setContinuationRequest] = useState<
		StreamRequest | undefined
	>();

	// Preserve thread ID across continuations (streamMetadata resets on new requests)
	const [preservedThreadId, setPreservedThreadId] = useState<
		string | undefined
	>();

	// Load config on mount
	useEffect(() => {
		void loadConfig().then(cfg => {
			if (cfg) {
				setConfig(cfg);
			} else {
				setAuthError(true);
				setTimeout(() => {
					exit();
				}, 100);
			}
		});
	}, [exit]);

	// Build initial request (snake_case properties match backend API)
	/* eslint-disable @typescript-eslint/naming-convention */
	const initialRequest = useMemo<StreamRequest | undefined>(
		() =>
			config
				? {
						input: {messages: [{role: 'user' as const, content: message}]},
						tools,
						metadata: {
							...(assistantId && {assistant_id: assistantId}),
							...(threadId && {thread_id: threadId}),
						},
				  }
				: undefined,
		[config, assistantId, message, threadId, tools],
	);
	/* eslint-enable @typescript-eslint/naming-convention */

	// Use continuation request if available, otherwise initial request
	const activeRequest = continuationRequest ?? initialRequest;

	// Stream
	const {status, messages, events, streamMetadata, finalResponse, error} =
		useStream(config, activeRequest);

	// Preserve thread ID when we get it (survives across continuation resets)
	useEffect(() => {
		if (streamMetadata?.thread_id) {
			setPreservedThreadId(streamMetadata.thread_id);
		}
	}, [streamMetadata?.thread_id]);

	// Use preserved thread ID or current streamMetadata
	const displayThreadId = preservedThreadId ?? streamMetadata?.thread_id;

	// Detect bash_tool calls from finalResponse (complete tool_calls with full args)
	useEffect(() => {
		if (!isBashEnabled) return;
		if (!finalResponse) return; // Wait for final response
		if (pendingBashCall) return; // Already handling a call
		if (bashConsent.isPending) return; // Waiting for consent

		// Look for tool_calls in the final response messages
		for (const msg of finalResponse.messages) {
			const toolCalls = msg['tool_calls'] as
				| Array<{id: string; name: string; args: Record<string, unknown>}>
				| undefined;
			if (!toolCalls) continue;

			for (const toolCall of toolCalls) {
				// Skip already processed or non-local tool calls
				if (processedToolCalls.has(toolCall.id)) continue;
				if (!isLocalTool(toolCall.name)) continue;

				const command = String(toolCall.args?.['command'] ?? '');
				if (!command) continue;

				// Mark as being processed and trigger consent flow
				setProcessedToolCalls(prev => new Set([...prev, toolCall.id]));
				setPendingBashCall({id: toolCall.id, command});
				bashConsent.requestConsent(command, toolCall.id);
				return;
			}
		}
	}, [
		finalResponse,
		isBashEnabled,
		pendingBashCall,
		bashConsent,
		processedToolCalls,
	]);

	// Handle bash consent decisions
	useEffect(() => {
		if (!pendingBashCall) return;

		// Handle blocked commands
		if (bashConsent.state.type === 'blocked') {
			// Command was auto-blocked, continue conversation with denied result
			const deniedResult = formatDeniedResult(
				bashConsent.state.command,
				bashConsent.state.reason,
			);
			continueConversation(bashConsent.state.toolCallId, deniedResult);
			setPendingBashCall(undefined);
			bashConsent.reset();
			return;
		}

		// Handle user decision
		if (bashConsent.state.type === 'decided') {
			if (bashConsent.state.response === 'approved') {
				// Execute the command
				void executeBashCommand(
					bashConsent.state.command,
					bashConsent.state.toolCallId,
				);
			} else {
				// User denied, continue conversation with denied result
				const deniedResult = formatDeniedResult(
					bashConsent.state.command,
					bashConsent.state.reason ?? 'User denied execution',
				);
				continueConversation(bashConsent.state.toolCallId, deniedResult);
			}

			setPendingBashCall(undefined);
			bashConsent.reset();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bashConsent.state, pendingBashCall]);

	// Auto-approve if enabled
	useEffect(() => {
		if (isAutoApprove && bashConsent.state.type === 'pending') {
			bashConsent.approve();
		}
	}, [isAutoApprove, bashConsent]);

	async function executeBashCommand(command: string, toolCallId: string) {
		const result = await executeBash({
			command,
			timeout: bashTimeout,
		});

		// Store result for display
		setBashResults(prev => [...prev, {command, result}]);

		// Continue conversation with result
		const formattedResult = formatResultForLlm(result);
		continueConversation(toolCallId, formattedResult);
	}

	function continueConversation(toolCallId: string, resultContent: string) {
		if (!streamMetadata?.thread_id || !config) return;

		// Build continuation request with tool result
		/* eslint-disable @typescript-eslint/naming-convention */
		const continuation: StreamRequest = {
			input: {
				messages: [
					{
						role: 'tool' as const,
						tool_call_id: toolCallId,
						content: resultContent,
					},
				],
			},
			tools,
			metadata: {
				...(assistantId && {assistant_id: assistantId}),
				thread_id: streamMetadata.thread_id,
			},
		};
		/* eslint-enable @typescript-eslint/naming-convention */

		setContinuationRequest(continuation);
	}

	// Group messages into blocks by type + name boundaries
	const messageBlocks = useMemo(
		() => groupMessagesIntoBlocks(messages),
		[messages],
	);

	// Check if there are any unprocessed local tool calls in finalResponse
	const hasUnprocessedToolCalls = useMemo(() => {
		if (!isBashEnabled) return false;
		if (!finalResponse) return false;

		for (const msg of finalResponse.messages) {
			const toolCalls = msg['tool_calls'] as
				| Array<{id: string; name: string; args: Record<string, unknown>}>
				| undefined;
			if (!toolCalls) continue;

			for (const toolCall of toolCalls) {
				if (processedToolCalls.has(toolCall.id)) continue;
				if (isLocalTool(toolCall.name)) return true;
			}
		}

		return false;
	}, [finalResponse, isBashEnabled, processedToolCalls]);

	// Exit on completion (only if not waiting for consent or executing bash)
	useEffect(() => {
		if (status === 'done' || status === 'error') {
			// Don't exit if we're handling a bash tool call or have unprocessed ones
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
			if (pendingBashCall || bashConsent.isPending || hasUnprocessedToolCalls) {
				return;
			}

			setTimeout(() => {
				exit();
			}, 100);
		}
	}, [
		status,
		exit,
		pendingBashCall,
		bashConsent.isPending,
		hasUnprocessedToolCalls,
	]);

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
				<Text color="red">Error: {error}</Text>
			</Box>
		);
	}

	// Render TUI
	return (
		<Box flexDirection="column">
			<StatusIndicator status={status} />

			{/* Message Blocks */}
			{messageBlocks.map(block => (
				<Box key={block.id} marginTop={1} flexDirection="column">
					{block.type === 'tool' ? (
						<>
							<Text dimColor color="cyan">
								Tool Output{block.name ? `: ${block.name}` : ''}
							</Text>
							<Box marginLeft={2} flexDirection="column">
								{(() => {
									if (!truncateOptions) {
										return <Text dimColor>{block.content}</Text>;
									}

									const result = truncate(block.content, truncateOptions);
									return (
										<>
											<Text dimColor>{result.text}</Text>
											{result.wasTruncated && (
												<Text dimColor color="yellow">
													(use --full-output for full output)
												</Text>
											)}
										</>
									);
								})()}
							</Box>
						</>
					) : (
						<Text>{block.content}</Text>
					)}
				</Box>
			))}

			{/* Bash execution results */}
			{bashResults.map(bashResult => (
				<Box key={`bash-result-${bashResult.command}`} marginTop={1}>
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

			{/* Bash consent prompt - only show when not auto-approving */}
			{bashConsent.state.type === 'pending' && !isAutoApprove && (
				<Box marginTop={1}>
					<BashConsentPrompt
						command={bashConsent.state.command}
						risk={bashConsent.state.risk}
						warnings={bashConsent.state.warnings}
						onApprove={bashConsent.approve}
						onDeny={bashConsent.deny}
					/>
				</Box>
			)}

			{/* Bash blocked notification */}
			{bashConsent.state.type === 'blocked' && (
				<Box marginTop={1}>
					<BashBlockedPrompt
						command={bashConsent.state.command}
						reason={bashConsent.state.reason}
					/>
				</Box>
			)}

			{/* Done indicator */}
			{status === 'done' && !pendingBashCall && !bashConsent.isPending && (
				<Box marginTop={1} flexDirection="column">
					<Text color="green">Done</Text>
					{extractModelFromEvents(events) && (
						<Text dimColor>Model: {extractModelFromEvents(events)}</Text>
					)}
					{displayThreadId && <Text dimColor>Thread: {displayThreadId}</Text>}
					{displayThreadId && (
						<Text dimColor>
							Continue: ruska chat -t {displayThreadId} &quot;message&quot;
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

	// TUI mode
	return (
		<ChatCommandTui
			message={message}
			assistantId={assistantId}
			threadId={threadId}
			tools={tools}
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
