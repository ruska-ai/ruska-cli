import React, {useState, useEffect} from 'react';
import {render, Text, Box, useApp} from 'ink';
import Spinner from 'ink-spinner';
import {type Assistant} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {createApiClient} from '../lib/api.js';

type Status = 'loading' | 'success' | 'error' | 'not-authenticated';

function AssistantsCommand() {
	const {exit} = useApp();
	const [status, setStatus] = useState<Status>('loading');
	const [assistants, setAssistants] = useState<Assistant[]>([]);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		const fetchAssistants = async () => {
			// Load config
			const config = await loadConfig();
			if (!config) {
				setStatus('not-authenticated');
				// Auto-exit after render
				setTimeout(() => {
					exit();
				}, 100);
				return;
			}

			// Fetch assistants
			const client = createApiClient(config);
			const result = await client.searchAssistants();

			if (result.success && result.data) {
				setAssistants(result.data.assistants);
				setStatus('success');
			} else {
				setError(result.error ?? 'Failed to fetch assistants');
				setStatus('error');
			}

			// Auto-exit after render
			setTimeout(() => {
				exit();
			}, 100);
		};

		void fetchAssistants();
	}, [exit]);

	if (status === 'loading') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Loading assistants...</Text>
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

	if (status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Error: {error}</Text>
			</Box>
		);
	}

	// Success
	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Your Assistants
				</Text>
			</Box>

			{assistants.length === 0 ? (
				<Text dimColor>No assistants found.</Text>
			) : (
				<Box flexDirection="column">
					{assistants.map(assistant => (
						<Text key={assistant.id}>
							<Text color="yellow">{assistant.id}</Text>
							<Text> </Text>
							<Text bold>{assistant.name}</Text>
							<Text dimColor> ({assistant.model})</Text>
						</Text>
					))}
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>
					Found {assistants.length} assistant
					{assistants.length === 1 ? '' : 's'}
				</Text>
			</Box>
		</Box>
	);
}

export async function runAssistantsCommand(): Promise<void> {
	const {waitUntilExit} = render(<AssistantsCommand />);
	await waitUntilExit();
}
