import React, {useState, useEffect} from 'react';
import {render, Text, Box, useApp} from 'ink';
import Spinner from 'ink-spinner';
import {type HealthResponse, hostPresets} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {fetchHealth} from '../lib/api.js';

type Status = 'loading' | 'success' | 'error';

function HealthCommand() {
	const {exit} = useApp();
	const [status, setStatus] = useState<Status>('loading');
	const [health, setHealth] = useState<HealthResponse | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const [host, setHost] = useState<string>('');

	useEffect(() => {
		const checkHealth = async () => {
			// Try to load config for host, fall back to production
			const config = await loadConfig();
			const targetHost = config?.host ?? hostPresets.production;
			setHost(targetHost);

			// Fetch health status
			const result = await fetchHealth(targetHost);

			if (result.success && result.data) {
				setHealth(result.data);
				setStatus('success');
			} else {
				setError(result.error ?? 'Failed to fetch health status');
				setStatus('error');
			}

			setTimeout(() => {
				exit();
			}, 100);
		};

		void checkHealth();
	}, [exit]);

	if (status === 'loading') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Checking health...</Text>
			</Box>
		);
	}

	if (status === 'error') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Health Check
					</Text>
					<Text dimColor> ({host})</Text>
				</Box>

				<Text>
					<Text dimColor>Status: </Text>
					<Text bold color="red">
						unhealthy
					</Text>
				</Text>
				<Text>
					<Text dimColor>Error: </Text>
					<Text color="red">{error}</Text>
				</Text>
			</Box>
		);
	}

	// Success - display health info
	const statusColor = health?.status === 'healthy' ? 'green' : 'yellow';

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Health Check
				</Text>
				<Text dimColor> ({host})</Text>
			</Box>

			<Text>
				<Text dimColor>Status: </Text>
				<Text bold color={statusColor}>
					{health?.status}
				</Text>
			</Text>
			<Text>
				<Text dimColor>Message: </Text>
				<Text>{health?.message}</Text>
			</Text>
			<Text>
				<Text dimColor>Version: </Text>
				<Text>{health?.version}</Text>
			</Text>
		</Box>
	);
}

export async function runHealthCommand(): Promise<void> {
	const {waitUntilExit} = render(<HealthCommand />);
	await waitUntilExit();
}
