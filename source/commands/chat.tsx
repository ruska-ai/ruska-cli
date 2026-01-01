import process from 'node:process';
import React, {useState, useEffect, useCallback} from 'react';
import {render, Text, Box, useApp, useInput} from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import {type Assistant, type ChatMessage} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {createApiClient} from '../lib/api.js';
import {streamChat, createStreamRequest} from '../lib/stream.js';

export type ChatCommandProps = {
	readonly assistantId?: string;
	readonly message?: string;
	readonly model?: string;
};

type Step =
	| 'check-auth'
	| 'loading-assistant'
	| 'input'
	| 'streaming'
	| 'error'
	| 'done';

/**
 * Non-interactive chat component - used when --message is provided
 * Does not use useInput to avoid TTY/raw mode issues
 */
function NonInteractiveChat({
	assistantId,
	message,
	model,
}: {
	readonly assistantId?: string;
	readonly message: string;
	readonly model?: string;
}) {
	const {exit} = useApp();
	const [step, setStep] = useState<Step>('check-auth');
	const [response, setResponse] = useState('');
	const [error, setError] = useState<string | undefined>(undefined);
	const [assistant, setAssistant] = useState<Assistant | undefined>(undefined);

	useEffect(() => {
		const runChat = async () => {
			const config = await loadConfig();
			if (!config) {
				setError('Not authenticated. Run `ruska auth` first.');
				setStep('error');
				setTimeout(() => {
					exit();
				}, 100);
				return;
			}

			// Load assistant if provided
			if (assistantId) {
				setStep('loading-assistant');
				const client = createApiClient(config);
				const result = await client.getAssistant(assistantId);

				if (
					result.success &&
					result.data &&
					result.data.assistants.length > 0
				) {
					setAssistant(result.data.assistants[0]);
				} else {
					setError(`Assistant not found: ${assistantId}`);
					setStep('error');
					setTimeout(() => {
						exit();
					}, 100);
					return;
				}
			}

			// Start streaming
			setStep('streaming');

			const request = createStreamRequest(message, {
				model: model ?? assistant?.model,
				assistantId: assistantId ?? assistant?.id,
				systemPrompt: assistant?.system_prompt,
				tools: assistant?.tools,
			});

			let fullResponse = '';

			await streamChat(config, request, {
				onToken(token: string) {
					fullResponse += token;
					setResponse(fullResponse);
				},
				onError(errorMessage: string) {
					setError(errorMessage);
					setStep('error');
					setTimeout(() => {
						exit();
					}, 100);
				},
				onComplete() {
					setStep('done');
					setTimeout(() => {
						exit();
					}, 100);
				},
			});
		};

		void runChat();
	}, [assistantId, message, model, assistant, exit]);

	if (step === 'check-auth') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Checking authentication...</Text>
			</Box>
		);
	}

	if (step === 'loading-assistant') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Loading assistant...</Text>
			</Box>
		);
	}

	if (step === 'error') {
		return <Text color="red">Error: {error}</Text>;
	}

	if (step === 'streaming') {
		return (
			<Box>
				<Text bold color="green">
					AI:{' '}
				</Text>
				<Text>{response}</Text>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
			</Box>
		);
	}

	// Done
	return (
		<Box>
			<Text bold color="green">
				AI:{' '}
			</Text>
			<Text>{response}</Text>
		</Box>
	);
}

/**
 * Interactive chat component - used when no --message is provided
 * Uses useInput for escape key handling
 */
function InteractiveChat({
	assistantId,
	model,
}: {
	readonly assistantId?: string;
	readonly model?: string;
}) {
	const {exit} = useApp();
	const [step, setStep] = useState<Step>('check-auth');
	const [inputValue, setInputValue] = useState('');
	const [response, setResponse] = useState('');
	const [error, setError] = useState<string | undefined>(undefined);
	const [assistant, setAssistant] = useState<Assistant | undefined>(undefined);
	const [history, setHistory] = useState<ChatMessage[]>([]);
	const [abortController, setAbortController] = useState<
		AbortController | undefined
	>(undefined);

	// Handle escape key to exit
	useInput(
		(_input, key) => {
			if (key.escape) {
				if (abortController) {
					abortController.abort();
				}

				exit();
			}
		},
		{isActive: step !== 'done' && step !== 'error'},
	);

	// Initialize: check auth and load assistant
	useEffect(() => {
		const initialize = async () => {
			const config = await loadConfig();
			if (!config) {
				setError('Not authenticated. Run `ruska auth` first.');
				setStep('error');
				setTimeout(() => {
					exit();
				}, 100);
				return;
			}

			// If assistant ID provided, load it
			if (assistantId) {
				setStep('loading-assistant');
				const client = createApiClient(config);
				const result = await client.getAssistant(assistantId);

				if (
					result.success &&
					result.data &&
					result.data.assistants.length > 0
				) {
					setAssistant(result.data.assistants[0]);
				} else {
					setError(`Assistant not found: ${assistantId}`);
					setStep('error');
					setTimeout(() => {
						exit();
					}, 100);
					return;
				}
			}

			setStep('input');
		};

		void initialize();
	}, [assistantId, exit]);

	const handleSendMessage = useCallback(
		async (userMessage: string) => {
			const config = await loadConfig();
			if (!config) {
				setError('Authentication lost');
				setStep('error');
				return;
			}

			setStep('streaming');
			setResponse('');

			// Build request options
			const request = createStreamRequest(userMessage, {
				model: model ?? assistant?.model,
				assistantId: assistantId ?? assistant?.id,
				systemPrompt: assistant?.system_prompt,
				tools: assistant?.tools,
				history,
			});

			// Add user message to history
			const newHistory: ChatMessage[] = [
				...history,
				{role: 'user', content: userMessage},
			];
			setHistory(newHistory);

			let fullResponse = '';

			const controller = await streamChat(config, request, {
				onToken(token: string) {
					fullResponse += token;
					setResponse(fullResponse);
				},
				onError(errorMessage: string) {
					setError(errorMessage);
					setStep('error');
				},
				onComplete() {
					if (fullResponse) {
						setHistory(previous => [
							...previous,
							{role: 'assistant', content: fullResponse},
						]);
					}

					setStep('input');
					setInputValue('');
				},
			});

			setAbortController(controller);
		},
		[assistant, assistantId, history, model],
	);

	const handleInputSubmit = useCallback(async () => {
		if (inputValue.trim()) {
			await handleSendMessage(inputValue.trim());
		}
	}, [inputValue, handleSendMessage]);

	if (step === 'check-auth') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Checking authentication...</Text>
			</Box>
		);
	}

	if (step === 'loading-assistant') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Loading assistant...</Text>
			</Box>
		);
	}

	if (step === 'error') {
		return <Text color="red">Error: {error}</Text>;
	}

	return (
		<Box flexDirection="column">
			{/* Header with assistant info */}
			{assistant && (
				<Box marginBottom={1}>
					<Text dimColor>
						Chatting with: <Text bold>{assistant.name}</Text>
						{assistant.model && <Text> ({assistant.model})</Text>}
					</Text>
				</Box>
			)}

			{/* Conversation history */}
			{history.map((historyMessage, index) => (
				<Box key={historyMessage.id ?? `msg-${index}`} marginBottom={1}>
					{historyMessage.role === 'user' ? (
						<Box>
							<Text bold color="blue">
								You:{' '}
							</Text>
							<Text>{historyMessage.content}</Text>
						</Box>
					) : (
						<Box>
							<Text bold color="green">
								AI:{' '}
							</Text>
							<Text>{historyMessage.content}</Text>
						</Box>
					)}
				</Box>
			))}

			{/* Streaming response */}
			{step === 'streaming' && (
				<Box marginBottom={1}>
					<Text bold color="green">
						AI:{' '}
					</Text>
					<Text>{response}</Text>
					<Text color="cyan">
						<Spinner type="dots" />
					</Text>
				</Box>
			)}

			{/* Input prompt */}
			{step === 'input' && (
				<Box>
					<Text bold color="blue">
						You:{' '}
					</Text>
					<TextInput
						placeholder="Type your message..."
						value={inputValue}
						onChange={setInputValue}
						onSubmit={handleInputSubmit}
					/>
				</Box>
			)}

			{/* Help text */}
			{step === 'input' && (
				<Box marginTop={1}>
					<Text dimColor>Press Enter to send, Esc to exit</Text>
				</Box>
			)}
		</Box>
	);
}

/**
 * Exported component for testing
 */
export function ChatCommand({assistantId, message, model}: ChatCommandProps) {
	if (message) {
		return (
			<NonInteractiveChat
				assistantId={assistantId}
				message={message}
				model={model}
			/>
		);
	}

	return <InteractiveChat assistantId={assistantId} model={model} />;
}

// ANSI escape sequences for terminal colors
const ansiColors = {
	green: '\u001B[32m',
	red: '\u001B[31m',
	reset: '\u001B[0m',
	clearLine: '\r\u001B[K',
};

/**
 * Run non-interactive chat without Ink (avoids TTY/raw mode issues)
 */
async function runNonInteractiveChat(
	message: string,
	assistantId?: string,
	model?: string,
): Promise<void> {
	const config = await loadConfig();
	if (!config) {
		throw new Error('Not authenticated. Run `ruska auth` first.');
	}

	let assistant: Assistant | undefined;

	// Load assistant if provided
	if (assistantId) {
		process.stdout.write('Loading assistant...');
		const client = createApiClient(config);
		const result = await client.getAssistant(assistantId);

		if (result.success && result.data && result.data.assistants.length > 0) {
			assistant = result.data.assistants[0];
			process.stdout.write(ansiColors.clearLine);
		} else {
			throw new Error(`Assistant not found: ${assistantId}`);
		}
	}

	// Build request
	const request = createStreamRequest(message, {
		model: model ?? assistant?.model,
		assistantId: assistantId ?? assistant?.id,
		systemPrompt: assistant?.system_prompt,
		tools: assistant?.tools,
	});

	// Stream the response
	process.stdout.write(`${ansiColors.green}AI:${ansiColors.reset} `);

	await new Promise<void>((resolve, reject) => {
		void streamChat(config, request, {
			onToken(token: string) {
				process.stdout.write(token);
			},
			onError(errorMessage: string) {
				console.error(
					`\n${ansiColors.red}Error:${ansiColors.reset} ${errorMessage}`,
				);
				reject(new Error(errorMessage));
			},
			onComplete() {
				process.stdout.write('\n');
				resolve();
			},
		});
	});
}

export async function runChatCommand(options: ChatCommandProps): Promise<void> {
	const isNonInteractive = Boolean(options.message);

	if (isNonInteractive) {
		// Non-interactive mode: use plain console output to avoid TTY issues
		await runNonInteractiveChat(
			options.message!,
			options.assistantId,
			options.model,
		);
	} else {
		// Interactive mode: use Ink for full TUI experience
		const {waitUntilExit} = render(
			<InteractiveChat
				assistantId={options.assistantId}
				model={options.model}
			/>,
		);
		await waitUntilExit();
	}
}
