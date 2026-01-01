import React, {useState, useEffect} from 'react';
import {render, Text, Box, useApp} from 'ink';
import Spinner from 'ink-spinner';
import {type Assistant} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {createApiClient} from '../lib/api.js';

type Status =
	| 'loading'
	| 'success'
	| 'error'
	| 'not-authenticated'
	| 'not-found';

type AssistantCommandProps = {
	readonly assistantId: string;
};

function AssistantCommand({assistantId}: AssistantCommandProps) {
	const {exit} = useApp();
	const [status, setStatus] = useState<Status>('loading');
	const [assistant, setAssistant] = useState<Assistant | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		const fetchAssistant = async () => {
			// Load config
			const config = await loadConfig();
			if (!config) {
				setStatus('not-authenticated');
				setTimeout(() => {
					exit();
				}, 100);
				return;
			}

			// Fetch assistant by ID
			const client = createApiClient(config);
			const result = await client.getAssistant(assistantId);

			if (result.success && result.data) {
				const {assistants} = result.data;
				if (assistants.length > 0) {
					setAssistant(assistants[0]);
					setStatus('success');
				} else {
					setStatus('not-found');
				}
			} else {
				setError(result.error ?? 'Failed to fetch assistant');
				setStatus('error');
			}

			setTimeout(() => {
				exit();
			}, 100);
		};

		void fetchAssistant();
	}, [exit, assistantId]);

	if (status === 'loading') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Loading assistant...</Text>
			</Box>
		);
	}

	if (status === 'not-authenticated') {
		return (
			<Box flexDirection="column">
				<Text color="yellow">Not authenticated.</Text>
				<Text>
					Run <Text bold>ruska auth</Text> to configure your API key.
				</Text>
			</Box>
		);
	}

	if (status === 'not-found') {
		return (
			<Box flexDirection="column">
				<Text color="yellow">Assistant not found: {assistantId}</Text>
			</Box>
		);
	}

	if (status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Error: {error}</Text>
			</Box>
		);
	}

	// Success - display assistant details
	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Assistant Details
				</Text>
			</Box>

			{assistant && (
				<Box flexDirection="column">
					{assistant.updated_at && (
						<Text>
							<Text dimColor>Last Update: </Text>
							<Text>{assistant.updated_at}</Text>
						</Text>
					)}
					<Text>
						<Text dimColor>ID: </Text>
						<Text color="yellow">{assistant.id}</Text>
					</Text>
					<Text>
						<Text dimColor>Name: </Text>
						<Text bold>{assistant.name}</Text>
					</Text>
					{assistant.description && (
						<Text>
							<Text dimColor>Description: </Text>
							<Text>{assistant.description}</Text>
						</Text>
					)}
					<Text>
						<Text dimColor>Model: </Text>
						<Text>{assistant.model}</Text>
					</Text>
					{assistant.tools && assistant.tools.length > 0 && (
						<Text>
							<Text dimColor>Tools: </Text>
							<Text>{assistant.tools.join(', ')}</Text>
						</Text>
					)}
					{assistant.subagents && assistant.subagents.length > 0 && (
						<Text>
							<Text dimColor>Subagents: </Text>
							<Text>{assistant.subagents.join(', ')}</Text>
						</Text>
					)}
					{assistant.system_prompt && (
						<Text>
							<Text dimColor>System Prompt: </Text>
							<Text>{assistant.system_prompt}</Text>
						</Text>
					)}
					{assistant.instructions && (
						<Text>
							<Text dimColor>Instructions: </Text>
							<Text>{assistant.instructions}</Text>
						</Text>
					)}
				</Box>
			)}
		</Box>
	);
}

export async function runAssistantCommand(assistantId: string): Promise<void> {
	const {waitUntilExit} = render(
		<AssistantCommand assistantId={assistantId} />,
	);
	await waitUntilExit();
}
