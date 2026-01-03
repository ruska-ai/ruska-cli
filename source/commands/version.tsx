import React, {useState, useEffect} from 'react';
import {render, Text, Box, useApp} from 'ink';
import Spinner from 'ink-spinner';
import {type HealthResponse, hostPresets} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {fetchHealth} from '../lib/api.js';

type Status = 'loading' | 'success' | 'error';

const cliVersion = '0.1.3';

function VersionCommand() {
	const {exit} = useApp();
	const [status, setStatus] = useState<Status>('loading');
	const [health, setHealth] = useState<HealthResponse | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const [host, setHost] = useState<string>('');

	useEffect(() => {
		const getVersion = async () => {
			// Try to load config for host, fall back to production
			const config = await loadConfig();
			const targetHost = config?.host ?? hostPresets.production;
			setHost(targetHost);

			// Fetch health to get API version
			const result = await fetchHealth(targetHost);

			if (result.success && result.data) {
				setHealth(result.data);
				setStatus('success');
			} else {
				setError(result.error ?? 'Failed to fetch API version');
				setStatus('error');
			}

			setTimeout(() => {
				exit();
			}, 100);
		};

		void getVersion();
	}, [exit]);

	if (status === 'loading') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Loading version info...</Text>
			</Box>
		);
	}

	// Always show CLI version
	return (
		<Box flexDirection="column">
			<Text>
				<Text bold color="cyan">
					@ruska/cli
				</Text>
				<Text> v{cliVersion}</Text>
			</Text>

			{status === 'error' ? (
				<Text>
					<Text bold>API:</Text>
					<Text color="red"> unavailable</Text>
					<Text dimColor> ({error})</Text>
				</Text>
			) : (
				<Text>
					<Text bold>API:</Text>
					<Text color="green"> v{health?.version}</Text>
					<Text dimColor> ({host})</Text>
				</Text>
			)}
		</Box>
	);
}

export async function runVersionCommand(): Promise<void> {
	const {waitUntilExit} = render(<VersionCommand />);
	await waitUntilExit();
}
