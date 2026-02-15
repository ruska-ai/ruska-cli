/**
 * Tool Registry — 3-step structured output pattern.
 * Validates definitions on register, validates tool calls before execution,
 * and captures executor errors as ToolResult with isError: true.
 */

import {
	type ToolCall,
	type ToolDefinition,
	type ToolResult,
	toolCallSchema,
	toolDefinitionSchema,
} from './schemas.js';

/**
 * Executor function type: receives parsed args, returns content string.
 */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<string>;

/**
 * ToolRegistry interface.
 */
export type ToolRegistry = {
	readonly register: (
		definition: ToolDefinition,
		executor: ToolExecutor,
	) => void;
	readonly definitions: () => ToolDefinition[];
	readonly execute: (toolCall: ToolCall) => Promise<ToolResult>;
	readonly has: (name: string) => boolean;
};

/**
 * Creates a new tool registry.
 */
export function createToolRegistry(): ToolRegistry {
	const tools = new Map<
		string,
		{definition: ToolDefinition; executor: ToolExecutor}
	>();

	return {
		register(definition: ToolDefinition, executor: ToolExecutor): void {
			// Validate definition schema to catch malformed definitions early
			toolDefinitionSchema.parse(definition);

			if (tools.has(definition.name)) {
				throw new Error(`Tool "${definition.name}" is already registered`);
			}

			tools.set(definition.name, {definition, executor});
		},

		definitions(): ToolDefinition[] {
			return [...tools.values()].map(t => t.definition);
		},

		async execute(toolCall: ToolCall): Promise<ToolResult> {
			// Validate the tool call structure
			toolCallSchema.parse(toolCall);

			const entry = tools.get(toolCall.name);
			if (!entry) {
				return {
					toolCallId: toolCall.id,
					content: `Unknown tool: ${toolCall.name}`,
					isError: true,
				};
			}

			try {
				const content = await entry.executor(toolCall.args);
				return {
					toolCallId: toolCall.id,
					content,
				};
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					toolCallId: toolCall.id,
					content: message,
					isError: true,
				};
			}
		},

		has(name: string): boolean {
			return tools.has(name);
		},
	};
}

/**
 * Convenience builder for defining a tool definition.
 */
export function defineTool(
	name: string,
	description: string,
	parameters: ToolDefinition['parameters'],
): ToolDefinition {
	const definition: ToolDefinition = {name, description, parameters};
	// Validate immediately
	toolDefinitionSchema.parse(definition);
	return definition;
}
