import process from 'node:process';
import React, {useState, useEffect} from 'react';
import {render, Text, Box, useApp, useInput} from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import {hostPresets, type HostPreset} from '../types/index.js';
import {saveConfig, loadConfig, clearConfig} from '../lib/config.js';
import {validateApiKey} from '../lib/api.js';

type Step =
	| 'check'
	| 'host'
	| 'custom-host'
	| 'apikey'
	| 'validating'
	| 'done'
	| 'no-tty';

type HostItem = {
	label: string;
	value: HostPreset | 'custom';
};

const hostItems: HostItem[] = [
	{label: `Production (${hostPresets.production})`, value: 'production'},
	{label: `Development (${hostPresets.development})`, value: 'development'},
	{label: 'Custom URL...', value: 'custom'},
];

function AuthCommand() {
	const {exit} = useApp();
	const [step, setStep] = useState<Step>('check');
	const [host, setHost] = useState('');
	const [customHost, setCustomHost] = useState('');
	const [apiKey, setApiKey] = useState('');
	const [error, setError] = useState<string | undefined>(undefined);
	const [userName, setUserName] = useState<string | undefined>(undefined);
	const hasTty = Boolean(process.stdin.isTTY);

	// Check existing config on mount
	useEffect(() => {
		const checkExisting = async () => {
			const config = await loadConfig();
			if (config) {
				// Validate existing config
				setStep('validating');
				const result = await validateApiKey(config.host, config.apiKey);
				if (result.success && result.data) {
					setUserName(result.data.user.name ?? result.data.user.email);
					setHost(config.host);
					setStep('done');
				} else {
					// Existing config is invalid, start fresh
					await clearConfig();
					if (hasTty) {
						setStep('host');
					} else {
						setStep('no-tty');
					}
				}
			} else if (hasTty) {
				setStep('host');
			} else {
				setStep('no-tty');
			}
		};

		void checkExisting();
	}, [hasTty]);

	// Auto-exit for terminal states (done, no-tty)
	useEffect(() => {
		if (step === 'done' || step === 'no-tty') {
			setTimeout(() => {
				exit();
			}, 100);
		}
	}, [step, exit]);

	// Handle escape key during interactive prompts
	useInput(
		(_input, key) => {
			if (key.escape) {
				exit();
			}
		},
		{isActive: hasTty && step !== 'done' && step !== 'no-tty'},
	);

	const handleHostSelect = (item: HostItem) => {
		if (item.value === 'custom') {
			setStep('custom-host');
		} else {
			setHost(hostPresets[item.value]);
			setStep('apikey');
		}
	};

	const handleCustomHostSubmit = () => {
		if (customHost.trim()) {
			setHost(customHost.trim());
			setStep('apikey');
		}
	};

	const handleApiKeySubmit = async () => {
		if (!apiKey.trim()) {
			return;
		}

		setError(undefined);
		setStep('validating');

		const result = await validateApiKey(host, apiKey.trim());

		if (result.success && result.data) {
			// Save config
			await saveConfig({host, apiKey: apiKey.trim()});
			setUserName(result.data.user.name ?? result.data.user.email);
			setStep('done');
		} else {
			setError(result.error ?? 'Authentication failed');
			setStep('apikey');
		}
	};

	// Checking existing config
	if (step === 'check') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Checking existing configuration...</Text>
			</Box>
		);
	}

	// Host selection
	if (step === 'host') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Ruska CLI Authentication
					</Text>
				</Box>
				<Text>Select your Orchestra host:</Text>
				<Box marginTop={1}>
					<SelectInput items={hostItems} onSelect={handleHostSelect} />
				</Box>
			</Box>
		);
	}

	// Custom host input
	if (step === 'custom-host') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Ruska CLI Authentication
					</Text>
				</Box>
				<Box>
					<Text>Enter custom host URL: </Text>
					<TextInput
						value={customHost}
						placeholder="https://your-orchestra-host.com"
						onChange={setCustomHost}
						onSubmit={handleCustomHostSubmit}
					/>
				</Box>
			</Box>
		);
	}

	// API key input
	if (step === 'apikey') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Ruska CLI Authentication
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text dimColor>Host: {host}</Text>
				</Box>
				{error && (
					<Box marginBottom={1}>
						<Text color="red">{error}</Text>
					</Box>
				)}
				<Box>
					<Text>Enter your API key: </Text>
					<TextInput
						value={apiKey}
						placeholder="otk_..."
						mask="*"
						onChange={setApiKey}
						onSubmit={handleApiKeySubmit}
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						Get your API key from Settings in the Orchestra web app
					</Text>
				</Box>
			</Box>
		);
	}

	// Validating
	if (step === 'validating') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Validating API key...</Text>
			</Box>
		);
	}

	// Done
	if (step === 'done') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text color="green">Authentication successful!</Text>
				</Box>
				<Box>
					<Text>Logged in as: </Text>
					<Text bold color="cyan">
						{userName}
					</Text>
				</Box>
				<Box>
					<Text dimColor>Host: {host}</Text>
				</Box>
			</Box>
		);
	}

	// No TTY - can't do interactive auth
	if (step === 'no-tty') {
		return (
			<Box flexDirection="column">
				<Text color="yellow">
					Interactive authentication requires a terminal.
				</Text>
				<Text>Please run this command in an interactive terminal session.</Text>
			</Box>
		);
	}

	return null;
}

export async function runAuthCommand(): Promise<void> {
	const {waitUntilExit} = render(<AuthCommand />);
	await waitUntilExit();
}
