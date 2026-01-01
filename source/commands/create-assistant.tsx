import React, {useState, useEffect} from 'react';
import {render, Text, Box, useApp, useInput} from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import {type CreateAssistantRequest, hostPresets} from '../types/index.js';
import {loadConfig} from '../lib/config.js';
import {createApiClient, fetchModels} from '../lib/api.js';
import {ModelSelect} from '../components/model-select.js';

export type CreateAssistantOptions = {
	interactive?: boolean;
	name?: string;
	model?: string;
	description?: string;
	systemPrompt?: string;
	tools?: string;
};

type Step =
	| 'check-auth'
	| 'name'
	| 'description'
	| 'model'
	| 'system-prompt'
	| 'tools'
	| 'creating'
	| 'done'
	| 'error';

type InteractiveProps = {
	readonly initialName?: string;
	readonly initialModel?: string;
	readonly initialDescription?: string;
	readonly initialSystemPrompt?: string;
	readonly initialTools?: string;
};

function InteractiveCreateAssistant({
	initialName = '',
	initialModel = '',
	initialDescription = '',
	initialSystemPrompt = '',
	initialTools = '',
}: InteractiveProps) {
	const {exit} = useApp();
	const [step, setStep] = useState<Step>('check-auth');
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription);
	const [model, setModel] = useState(initialModel);
	const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
	const [tools, setTools] = useState(initialTools);
	const [assistantId, setAssistantId] = useState<string | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const [availableModels, setAvailableModels] = useState<string[]>([]);

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

			// Fetch available models
			const modelsResult = await fetchModels(
				config.host ?? hostPresets.production,
				config.apiKey,
			);
			if (modelsResult.success && modelsResult.data) {
				setAvailableModels(modelsResult.data.models);
			}

			setStep('name');
		};

		void initialize();
	}, [exit]);

	useEffect(() => {
		if (step === 'done' || step === 'error') {
			setTimeout(() => {
				exit();
			}, 100);
		}
	}, [step, exit]);

	useInput(
		(_input, key) => {
			if (key.escape) {
				exit();
			}
		},
		{
			isActive:
				step !== 'done' &&
				step !== 'error' &&
				step !== 'creating' &&
				step !== 'model',
		},
	);

	const handleNameSubmit = () => {
		if (name.trim()) {
			setStep('description');
		}
	};

	const handleDescriptionSubmit = () => {
		setStep('model');
	};

	const handleModelSubmit = () => {
		setStep('system-prompt');
	};

	const handleSystemPromptSubmit = () => {
		setStep('tools');
	};

	const handleToolsSubmit = async () => {
		setStep('creating');

		const config = await loadConfig();
		if (!config) {
			setError('Authentication lost');
			setStep('error');
			return;
		}

		const client = createApiClient(config);

		const assistant: CreateAssistantRequest = {
			name: name.trim(),
			description: description.trim() || undefined,
			model: model.trim() || undefined,
			// eslint-disable-next-line @typescript-eslint/naming-convention -- API requires snake_case
			system_prompt: systemPrompt.trim() || undefined,
			tools: tools
				.split(',')
				.map(t => t.trim())
				.filter(Boolean),
		};

		const result = await client.createAssistant(assistant);

		if (result.success && result.data) {
			setAssistantId(result.data.assistant_id);
			setStep('done');
		} else {
			setError(result.error ?? 'Failed to create assistant');
			setStep('error');
		}
	};

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

	if (step === 'error') {
		return <Text color="red">Error: {error}</Text>;
	}

	if (step === 'name') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Create Assistant
					</Text>
				</Box>
				<Box>
					<Text>Name: </Text>
					<TextInput
						value={name}
						placeholder="My Assistant"
						onChange={setName}
						onSubmit={handleNameSubmit}
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press Enter to continue, Esc to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'description') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Create Assistant
					</Text>
				</Box>
				<Text dimColor>Name: {name}</Text>
				<Box marginTop={1}>
					<Text>Description: </Text>
					<TextInput
						value={description}
						placeholder="A helpful assistant (optional)"
						onChange={setDescription}
						onSubmit={handleDescriptionSubmit}
					/>
				</Box>
			</Box>
		);
	}

	if (step === 'model') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Create Assistant
					</Text>
				</Box>
				<Text dimColor>Name: {name}</Text>
				{description && <Text dimColor>Description: {description}</Text>}
				<Box marginTop={1}>
					<ModelSelect
						models={availableModels}
						value={model}
						onChange={setModel}
						onSubmit={selectedModel => {
							setModel(selectedModel);
							handleModelSubmit();
						}}
						onEscape={exit}
					/>
				</Box>
			</Box>
		);
	}

	if (step === 'system-prompt') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Create Assistant
					</Text>
				</Box>
				<Text dimColor>Name: {name}</Text>
				{description && <Text dimColor>Description: {description}</Text>}
				<Text dimColor>Model: {model}</Text>
				<Box marginTop={1}>
					<Text>System Prompt: </Text>
					<TextInput
						value={systemPrompt}
						placeholder="You are a helpful assistant. (optional)"
						onChange={setSystemPrompt}
						onSubmit={handleSystemPromptSubmit}
					/>
				</Box>
			</Box>
		);
	}

	if (step === 'tools') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Create Assistant
					</Text>
				</Box>
				<Text dimColor>Name: {name}</Text>
				{description && <Text dimColor>Description: {description}</Text>}
				<Text dimColor>Model: {model}</Text>
				{systemPrompt && <Text dimColor>System Prompt: {systemPrompt}</Text>}
				<Box marginTop={1}>
					<Text>Tools: </Text>
					<TextInput
						value={tools}
						placeholder="web_search, get_weather (comma-separated)"
						onChange={setTools}
						onSubmit={handleToolsSubmit}
					/>
				</Box>
			</Box>
		);
	}

	if (step === 'creating') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Creating assistant...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="green">Assistant created successfully!</Text>
			<Text>
				<Text dimColor>ID: </Text>
				<Text color="yellow">{assistantId}</Text>
			</Text>
			<Text>
				<Text dimColor>Name: </Text>
				<Text bold>{name}</Text>
			</Text>
		</Box>
	);
}

type NonInteractiveProps = {
	readonly name: string;
	readonly model?: string;
	readonly description?: string;
	readonly systemPrompt?: string;
	readonly tools?: string;
};

function NonInteractiveCreateAssistant({
	name,
	model = 'openai:gpt-4.1-mini',
	description,
	systemPrompt,
	tools,
}: NonInteractiveProps) {
	const {exit} = useApp();
	const [status, setStatus] = useState<'creating' | 'done' | 'error'>(
		'creating',
	);
	const [assistantId, setAssistantId] = useState<string | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		const create = async () => {
			const config = await loadConfig();
			if (!config) {
				setError('Not authenticated. Run `ruska auth` first.');
				setStatus('error');
				setTimeout(() => {
					exit();
				}, 100);
				return;
			}

			const client = createApiClient(config);

			/* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- Empty strings should coalesce to undefined */
			const assistant: CreateAssistantRequest = {
				name,
				description: description || undefined,
				model: model || undefined,
				// eslint-disable-next-line @typescript-eslint/naming-convention -- API requires snake_case
				system_prompt: systemPrompt || undefined,
				tools: tools
					? tools
							.split(',')
							.map(t => t.trim())
							.filter(Boolean)
					: [],
			};
			/* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

			const result = await client.createAssistant(assistant);

			if (result.success && result.data) {
				setAssistantId(result.data.assistant_id);
				setStatus('done');
			} else {
				setError(result.error ?? 'Failed to create assistant');
				setStatus('error');
			}

			setTimeout(() => {
				exit();
			}, 100);
		};

		void create();
	}, [exit, name, model, description, systemPrompt, tools]);

	if (status === 'creating') {
		return (
			<Box>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
				<Text> Creating assistant...</Text>
			</Box>
		);
	}

	if (status === 'error') {
		return <Text color="red">Error: {error}</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text color="green">Assistant created successfully!</Text>
			<Text>
				<Text dimColor>ID: </Text>
				<Text color="yellow">{assistantId}</Text>
			</Text>
			<Text>
				<Text dimColor>Name: </Text>
				<Text bold>{name}</Text>
			</Text>
			{model && (
				<Text>
					<Text dimColor>Model: </Text>
					<Text>{model}</Text>
				</Text>
			)}
		</Box>
	);
}

export async function runCreateAssistantCommand(
	options: CreateAssistantOptions,
): Promise<void> {
	if (options.interactive) {
		const {waitUntilExit} = render(
			<InteractiveCreateAssistant
				initialName={options.name}
				initialModel={options.model}
				initialDescription={options.description}
				initialSystemPrompt={options.systemPrompt}
				initialTools={options.tools}
			/>,
		);
		await waitUntilExit();
	} else {
		// Non-interactive mode requires --name
		if (!options.name) {
			throw new Error(
				'--name is required.\nUsage: ruska create --name "My Agent" [--model ...] [--tools ...]\nOr use interactive mode: ruska create -i',
			);
		}

		const {waitUntilExit} = render(
			<NonInteractiveCreateAssistant
				name={options.name}
				model={options.model}
				description={options.description}
				systemPrompt={options.systemPrompt}
				tools={options.tools}
			/>,
		);
		await waitUntilExit();
	}
}
