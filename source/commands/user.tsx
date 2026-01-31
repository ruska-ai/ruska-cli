import React, {useState, useEffect} from 'react';
import {render, Text, Box, useApp} from 'ink';
import Spinner from 'ink-spinner';
import {type UserInfo} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {createApiClient} from '../lib/api.js';

type Status = 'loading' | 'success' | 'error' | 'no-auth';

function UserCommand() {
	const {exit} = useApp();
	const [status, setStatus] = useState<Status>('loading');
	const [userInfo, setUserInfo] = useState<UserInfo | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const [host, setHost] = useState<string>('');

	useEffect(() => {
		const getUser = async () => {
			// Load config
			const config = await loadConfig();
			if (!config) {
				setStatus('no-auth');
				setTimeout(() => {
					exit();
				}, 100);
				return;
			}

			setHost(config.host);

			// Fetch user info
			const client = createApiClient(config);
			const result = await client.getUserInfo();

			if (result.success && result.data) {
				setUserInfo(result.data);
				setStatus('success');
			} else {
				setError(result.error ?? 'Failed to fetch user info');
				setStatus('error');
			}

			setTimeout(() => {
				exit();
			}, 100);
		};

		void getUser();
	}, [exit]);

	if (status === 'loading') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Fetching user info...</Text>
			</Box>
		);
	}

	if (status === 'no-auth') {
		return (
			<Box flexDirection="column">
				<Text color="yellow">Not authenticated.</Text>
				<Text>
					Run <Text bold>ruska auth</Text> to configure.
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

	// Success - display user info
	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Current User
				</Text>
				<Text dimColor> ({host})</Text>
			</Box>

			{userInfo && (
				<Box flexDirection="column">
					<Box>
						<Text dimColor>ID: </Text>
						<Text>{userInfo.user.id}</Text>
					</Box>
					<Box>
						<Text dimColor>Email: </Text>
						<Text bold>{userInfo.user.email}</Text>
					</Box>
					{userInfo.user.name && (
						<Box>
							<Text dimColor>Name: </Text>
							<Text>{userInfo.user.name}</Text>
						</Box>
					)}
					{userInfo.user.username && (
						<Box>
							<Text dimColor>Username: </Text>
							<Text>{userInfo.user.username}</Text>
						</Box>
					)}

				{/* Environment/Feature Flags */}
				{userInfo.env && Object.keys(userInfo.env).length > 0 && (
					<Box marginTop={1} flexDirection="column">
						<Text bold>Features:</Text>
						{Object.entries(userInfo.env).map(([key, enabled]) => (
							<Box key={key}>
								<Text dimColor> - </Text>
								<Text color={enabled ? 'green' : 'gray'}>
									{key}: {enabled ? 'enabled' : 'disabled'}
								</Text>
							</Box>
						))}
					</Box>
				)}
				</Box>
			)}
		</Box>
	);
}

export async function runUserCommand(): Promise<void> {
	const {waitUntilExit} = render(<UserCommand />);
	await waitUntilExit();
}
