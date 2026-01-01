import React, {useState, useEffect} from 'react';
import {Text, Box, useInput} from 'ink';

type ModelSelectProps = {
	readonly models: string[];
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly onSubmit: (value: string) => void;
	readonly onEscape?: () => void;
};

const MAX_VISIBLE = 8;

export function ModelSelect({
	models,
	value,
	onChange,
	onSubmit,
	onEscape,
}: ModelSelectProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [cursorPosition, setCursorPosition] = useState(value.length);

	// Filter models based on input
	const filteredModels = value
		? models.filter((m) => m.toLowerCase().includes(value.toLowerCase()))
		: models;

	// Reset selection when filter changes
	useEffect(() => {
		setSelectedIndex(0);
	}, [value]);

	useInput((input, key) => {
		if (key.escape && onEscape) {
			onEscape();
			return;
		}

		if (key.downArrow) {
			setSelectedIndex((prev) =>
				Math.min(prev + 1, filteredModels.length - 1),
			);
		} else if (key.upArrow) {
			setSelectedIndex((prev) => Math.max(prev - 1, 0));
		} else if (key.tab) {
			// Tab to autocomplete
			if (filteredModels.length > 0 && filteredModels[selectedIndex]) {
				onChange(filteredModels[selectedIndex]!);
				setCursorPosition(filteredModels[selectedIndex]!.length);
			}
		} else if (key.return) {
			// Enter to submit
			const selectedModel =
				filteredModels.length > 0 && filteredModels[selectedIndex]
					? filteredModels[selectedIndex]!
					: value;
			onSubmit(selectedModel);
		} else if (key.backspace || key.delete) {
			if (value.length > 0) {
				onChange(value.slice(0, -1));
				setCursorPosition(Math.max(0, cursorPosition - 1));
			}
		} else if (input && !key.ctrl && !key.meta) {
			onChange(value + input);
			setCursorPosition(cursorPosition + input.length);
		}
	});

	// Calculate visible window
	const startIndex = Math.max(
		0,
		Math.min(selectedIndex - Math.floor(MAX_VISIBLE / 2), filteredModels.length - MAX_VISIBLE),
	);
	const visibleModels = filteredModels.slice(startIndex, startIndex + MAX_VISIBLE);

	return (
		<Box flexDirection="column">
			<Box>
				<Text>Model: </Text>
				<Text color="cyan">{value}</Text>
				<Text color="cyan">▋</Text>
			</Box>

			{filteredModels.length > 0 && (
				<Box flexDirection="column" marginTop={1} marginLeft={2}>
					{startIndex > 0 && (
						<Text dimColor>  ↑ {startIndex} more</Text>
					)}
					{visibleModels.map((model, idx) => {
						const actualIndex = startIndex + idx;
						const isSelected = actualIndex === selectedIndex;
						return (
							<Box key={model}>
								<Text color={isSelected ? 'cyan' : undefined}>
									{isSelected ? '❯ ' : '  '}
								</Text>
								<Text
									bold={isSelected}
									color={isSelected ? 'cyan' : undefined}
								>
									{model}
								</Text>
							</Box>
						);
					})}
					{startIndex + MAX_VISIBLE < filteredModels.length && (
						<Text dimColor>
							  ↓ {filteredModels.length - startIndex - MAX_VISIBLE} more
						</Text>
					)}
				</Box>
			)}

			{filteredModels.length === 0 && value && (
				<Box marginTop={1} marginLeft={2}>
					<Text dimColor>No matching models. Press Enter to use custom.</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>
					↑↓ navigate • Tab autocomplete • Enter select
				</Text>
			</Box>
		</Box>
	);
}
