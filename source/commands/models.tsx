import React, {useState, useEffect} from 'react';
import {render, Text, Box, useApp} from 'ink';
import Spinner from 'ink-spinner';
import {type ModelsResponse, hostPresets} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {fetchModels} from '../lib/api.js';

type Status = 'loading' | 'success' | 'error';

function ModelsCommand() {
	const {exit} = useApp();
	const [status, setStatus] = useState<Status>('loading');
	const [models, setModels] = useState<ModelsResponse | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const [host, setHost] = useState<string>('');

	useEffect(() => {
		const getModels = async () => {
			// Try to load config for host, fall back to production
			const config = await loadConfig();
			const targetHost = config?.host ?? hostPresets.production;
			setHost(targetHost);

			// Fetch models (auth is optional)
			const result = await fetchModels(targetHost, config?.apiKey);

			if (result.success && result.data) {
				setModels(result.data);
				setStatus('success');
			} else {
				setError(result.error ?? 'Failed to fetch models');
				setStatus('error');
			}

			setTimeout(() => {
				exit();
			}, 100);
		};

		void getModels();
	}, [exit]);

	if (status === 'loading') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Loading models...</Text>
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

	// Success - display models
	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Available Models
				</Text>
				<Text dimColor> ({host})</Text>
			</Box>

			{models && (
				<Box flexDirection="column">
					<Text>
						<Text dimColor>Default: </Text>
						<Text bold color="green">
							{models.default}
						</Text>
					</Text>

					<Box marginTop={1} flexDirection="column">
						<Text bold>Free Models:</Text>
						{models.free.map(model => (
							<Text key={model}>
								<Text dimColor> - </Text>
								<Text color="yellow">{model}</Text>
							</Text>
						))}
					</Box>

					<Box marginTop={1} flexDirection="column">
						<Text bold>All Models ({models.models.length}):</Text>
						{models.models.map(model => (
							<Text key={model}>
								<Text dimColor> - </Text>
								<Text>{model}</Text>
							</Text>
						))}
					</Box>
				</Box>
			)}
		</Box>
	);
}

export async function runModelsCommand(): Promise<void> {
	const {waitUntilExit} = render(<ModelsCommand />);
	await waitUntilExit();
}
