/**
 * Composable middleware system with typed hooks for extending agent behavior.
 */

import {
	type AgentEvent,
	type AgentState,
	type CoreMessage,
	type ToolCall,
	type ToolResult,
	type CompactError,
} from './schemas.js';

/**
 * Middleware hook definitions. All hooks are optional and support async.
 */
export type Middleware = {
	name?: string;
	onEvent?: (event: AgentEvent, state: AgentState) => Promise<void> | void;
	onError?: (error: CompactError, state: AgentState) => Promise<void> | void;
	beforeModel?: (
		messages: CoreMessage[],
		state: AgentState,
	) => Promise<CoreMessage[]> | CoreMessage[];
	beforePrompt?: (
		prompt: string,
		state: AgentState,
	) => Promise<string> | string;
	beforeToolExecution?: (
		toolCall: ToolCall,
		state: AgentState,
	) => Promise<boolean> | boolean;
	afterToolExecution?: (
		toolCall: ToolCall,
		result: ToolResult,
		state: AgentState,
	) => Promise<void> | void;
};

/**
 * MiddlewareStack manages an ordered list of middleware and runs hooks.
 */
export type MiddlewareStack = {
	use(middleware: Middleware): void;
	runOnEvent(event: AgentEvent, state: AgentState): Promise<void>;
	runOnError(error: CompactError, state: AgentState): Promise<void>;
	runBeforeModel(
		messages: CoreMessage[],
		state: AgentState,
	): Promise<CoreMessage[]>;
	runBeforePrompt(prompt: string, state: AgentState): Promise<string>;
	runBeforeToolExecution(
		toolCall: ToolCall,
		state: AgentState,
	): Promise<boolean>;
	runAfterToolExecution(
		toolCall: ToolCall,
		result: ToolResult,
		state: AgentState,
	): Promise<void>;
};

/**
 * Creates a middleware stack that executes hooks in registration order.
 * A stack with no middleware is a no-op passthrough.
 */
export function createMiddlewareStack(): MiddlewareStack {
	const middlewares: Middleware[] = [];

	return {
		use(middleware: Middleware) {
			middlewares.push(middleware);
		},

		async runOnEvent(event: AgentEvent, state: AgentState) {
			for (const mw of middlewares) {
				if (mw.onEvent) {
					// eslint-disable-next-line no-await-in-loop
					await mw.onEvent(event, state);
				}
			}
		},

		async runOnError(error: CompactError, state: AgentState) {
			for (const mw of middlewares) {
				if (mw.onError) {
					// eslint-disable-next-line no-await-in-loop
					await mw.onError(error, state);
				}
			}
		},

		async runBeforeModel(messages: CoreMessage[], state: AgentState) {
			let result = messages;
			for (const mw of middlewares) {
				if (mw.beforeModel) {
					// eslint-disable-next-line no-await-in-loop
					result = await mw.beforeModel(result, state);
				}
			}

			return result;
		},

		async runBeforePrompt(prompt: string, state: AgentState) {
			let result = prompt;
			for (const mw of middlewares) {
				if (mw.beforePrompt) {
					// eslint-disable-next-line no-await-in-loop
					result = await mw.beforePrompt(result, state);
				}
			}

			return result;
		},

		async runBeforeToolExecution(toolCall: ToolCall, state: AgentState) {
			for (const mw of middlewares) {
				if (mw.beforeToolExecution) {
					// eslint-disable-next-line no-await-in-loop
					const shouldContinue = await mw.beforeToolExecution(toolCall, state);
					if (!shouldContinue) {
						return false;
					}
				}
			}

			return true;
		},

		async runAfterToolExecution(
			toolCall: ToolCall,
			result: ToolResult,
			state: AgentState,
		) {
			for (const mw of middlewares) {
				if (mw.afterToolExecution) {
					// eslint-disable-next-line no-await-in-loop
					await mw.afterToolExecution(toolCall, result, state);
				}
			}
		},
	};
}
