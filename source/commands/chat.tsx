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
import {parseToolsFlag} from '../lib/tools.js';

type ChatCommandProps = {
	readonly message: string;
	readonly isJsonMode: boolean;
	readonly assistantId?: string;
	readonly threadId?: string;
	readonly tools?: string[];
	readonly truncateOptions?: TruncateOptions;
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
}: Omit<ChatCommandProps, 'isJsonMode'>) {
	const {exit} = useApp();
	const [config, setConfig] = useState<Config | undefined>();
	const [authError, setAuthError] = useState(false);

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

	// Build request (snake_case properties match backend API)
	/* eslint-disable @typescript-eslint/naming-convention */
	const request = useMemo<StreamRequest | undefined>(
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

	// Stream
	const {status, messages, events, error} = useStream(config, request);

	// Group messages into blocks by type + name boundaries
	const messageBlocks = useMemo(
		() => groupMessagesIntoBlocks(messages),
		[messages],
	);

	// Exit on completion
	useEffect(() => {
		if (status === 'done' || status === 'error') {
			setTimeout(() => {
				exit();
			}, 100);
		}
	}, [status, exit]);

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

			{/* Done indicator */}
			{status === 'done' && (
				<Box marginTop={1} flexDirection="column">
					<Text color="green">Done</Text>
					{request?.metadata?.thread_id && (
						<Text dimColor>Thread: {request.metadata.thread_id}</Text>
					)}
					{extractModelFromEvents(events) && (
						<Text dimColor>Model: {extractModelFromEvents(events)}</Text>
					)}
					{request?.metadata?.thread_id && (
						<Text dimColor>
							Continue: ruska chat &quot;message&quot; -t{' '}
							{request.metadata.thread_id}
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
}: ChatCommandProps) {
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
	} = {},
): Promise<void> {
	// Auto-detect: use JSON mode if not TTY (piped) or explicitly requested
	const isJsonMode = options.json ?? !checkIsTty();

	// Parse tools flag (undefined = defaults, 'disabled' = [], 'a,b' = ['a', 'b'])
	const parsedTools = parseToolsFlag(options.tools);

	const {waitUntilExit} = render(
		<ChatCommand
			message={message}
			isJsonMode={isJsonMode}
			assistantId={options.assistantId}
			threadId={options.threadId}
			tools={parsedTools}
			truncateOptions={options.truncateOptions}
		/>,
	);
	await waitUntilExit();
}
