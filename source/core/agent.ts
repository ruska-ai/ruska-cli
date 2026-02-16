/**
 * Agent Loop / Reducer — stateless reducer + imperative loop driver.
 * The centerpiece that ties together model, tools, middleware, context, and thread.
 * Covers US-012.
 */

import {
	type AgentConfig,
	type AgentState,
	type AgentEvent,
	type AgentAction,
	type ModelResult,
	type ToolCall,
	type HumanContactRequest,
	agentConfigSchema,
	modelResultSchema,
} from './schemas.js';
import {type MiddlewareStack} from './middleware.js';
import {type ToolRegistry} from './tool.js';
import {type ModelInterface} from './model.js';
import {buildContext} from './context.js';
import {compactify} from './errors.js';

// ---------------------------------------------------------------------------
// RunAgentInput — all inputs for the agent loop
// ---------------------------------------------------------------------------

export type RunAgentInput = {
	input: string;
	model: ModelInterface;
	toolRegistry: ToolRegistry;
	config: AgentConfig;
	middleware?: MiddlewareStack;
	humanContactHandler?: (request: HumanContactRequest) => Promise<string>;
	maxMessages?: number;
};

// ---------------------------------------------------------------------------
// RunAgentStreamInput — extends RunAgentInput with optional onEvent callback
// ---------------------------------------------------------------------------

export type RunAgentStreamInput = RunAgentInput & {
	onEvent?: (event: AgentEvent) => void;
};

// ---------------------------------------------------------------------------
// StepResult — internal type for handler returns with emitted events
// ---------------------------------------------------------------------------

type StepResult = {
	state: AgentState;
	emittedEvents: AgentEvent[];
};

// ---------------------------------------------------------------------------
// initialState — create a validated idle state from config
// ---------------------------------------------------------------------------

export function initialState(config: AgentConfig): AgentState {
	agentConfigSchema.parse(config);
	return {
		status: 'idle',
		events: [],
		iterations: 0,
		errorCount: 0,
	};
}

// ---------------------------------------------------------------------------
// reduce — pure function: (state, event) => new state
// ---------------------------------------------------------------------------

export function reduce(state: AgentState, event: AgentEvent): AgentState {
	const events = [...state.events, event];

	switch (event.type) {
		case 'user_input': {
			return {
				...state,
				status: 'running',
				events,
			};
		}

		case 'model_response': {
			return {
				...state,
				status: 'running',
				events,
				iterations: state.iterations + 1,
			};
		}

		case 'tool_call': {
			return {
				...state,
				status: 'running',
				events,
			};
		}

		case 'tool_result': {
			return {
				...state,
				status: 'running',
				events,
			};
		}

		case 'error': {
			return {
				...state,
				status: event.error.recoverable ? 'running' : 'error',
				events,
				errorCount: state.errorCount + 1,
			};
		}

		case 'human_contact': {
			return {
				...state,
				status: 'waiting_for_human',
				events,
			};
		}

		case 'done': {
			return {
				...state,
				status: 'done',
				events,
			};
		}

		default: {
			return {...state, events};
		}
	}
}

// ---------------------------------------------------------------------------
// nextAction — determine next step based on current state
// ---------------------------------------------------------------------------

export function nextAction(
	state: AgentState,
	config: AgentConfig,
): AgentAction {
	switch (state.status) {
		case 'done': {
			return {type: 'done', reason: 'Agent completed'};
		}

		case 'error': {
			return {type: 'error', reason: 'Unrecoverable error'};
		}

		case 'waiting_for_human': {
			// Find the most recent human_contact event
			const humanEvents = state.events.filter(
				(e): e is Extract<AgentEvent, {type: 'human_contact'}> =>
					e.type === 'human_contact',
			);
			const lastHuman = humanEvents.length > 0
				? humanEvents[humanEvents.length - 1]!
				: undefined;
			return {
				type: 'contact_human',
				humanRequest: lastHuman?.request,
			};
		}

		case 'idle': {
			return {type: 'call_model'};
		}

		case 'running': {
			// Check iteration limit
			if (state.iterations >= config.maxIterations) {
				return {type: 'done', reason: 'Max iterations reached'};
			}

			// Check error limit
			if (state.errorCount > config.maxErrors) {
				return {type: 'error', reason: 'Max errors exceeded'};
			}

			// Look at the last event to decide
			const lastEvent = state.events.length > 0
				? state.events[state.events.length - 1]!
				: undefined;

			if (!lastEvent) {
				return {type: 'call_model'};
			}

			switch (lastEvent.type) {
				case 'user_input': {
					return {type: 'call_model'};
				}

				case 'model_response': {
					// If model has tool calls, execute the first one
					if (
						lastEvent.result.toolCalls
						&& lastEvent.result.toolCalls.length > 0
					) {
						return {
							type: 'execute_tool',
							toolCall: lastEvent.result.toolCalls[0]!,
						};
					}

					// If model says done or has no tool calls, we're done
					if (lastEvent.result.done) {
						return {type: 'done', reason: 'Model signaled done'};
					}

					return {type: 'done', reason: 'Model response with no tool calls'};
				}

				case 'tool_result': {
					// After tool result, check if there are more tool calls pending
					const pendingToolCall = findPendingToolCall(state);
					if (pendingToolCall) {
						return {type: 'execute_tool', toolCall: pendingToolCall};
					}

					// Otherwise, call model again with updated context
					return {type: 'call_model'};
				}

				case 'error': {
					// If recoverable, retry model call
					if (state.errorCount <= config.maxErrors) {
						return {type: 'call_model'};
					}

					return {type: 'error', reason: 'Max errors exceeded'};
				}

				case 'human_contact': {
					return {
						type: 'contact_human',
						humanRequest: lastEvent.request,
					};
				}

				case 'done': {
					return {type: 'done', reason: 'Agent completed'};
				}

				default: {
					return {type: 'call_model'};
				}
			}
		}

		default: {
			return {type: 'error', reason: 'Unknown state'};
		}
	}
}

// ---------------------------------------------------------------------------
// Helper: find pending tool calls not yet executed
// ---------------------------------------------------------------------------

function findPendingToolCall(state: AgentState): ToolCall | undefined {
	// Walk backwards to find the most recent model_response
	let modelResult: ModelResult | undefined;
	for (let i = state.events.length - 1; i >= 0; i--) {
		const event = state.events[i]!;
		if (event.type === 'model_response') {
			modelResult = event.result;
			break;
		}
	}

	if (!modelResult?.toolCalls) {
		return undefined;
	}

	// Collect tool call IDs that have been executed (have results)
	const executedIds = new Set<string>();
	for (const event of state.events) {
		if (event.type === 'tool_result') {
			executedIds.add(event.result.toolCallId);
		}
	}

	// Find first tool call that hasn't been executed
	return modelResult.toolCalls.find(tc => !executedIds.has(tc.id));
}

// ---------------------------------------------------------------------------
// runAgentStream — async generator that yields events in real-time
// ---------------------------------------------------------------------------

export async function * runAgentStream(
	agentInput: RunAgentStreamInput,
): AsyncGenerator<AgentEvent, AgentState> {
	const {input, model, toolRegistry, config, middleware, maxMessages, onEvent} = agentInput;
	agentConfigSchema.parse(config);

	let state = initialState(config);

	// Inject user input
	const userEvent: AgentEvent = {
		type: 'user_input',
		message: {role: 'user', content: input},
		timestamp: Date.now(),
	};
	state = reduce(state, userEvent);
	if (middleware) {
		await middleware.runOnEvent(userEvent, state);
	}

	if (onEvent) {
		onEvent(userEvent);
	}

	yield userEvent;

	// Main loop
	let loopGuard = 0;
	const maxLoop = (config.maxIterations + config.maxErrors + 1) * 10;

	while (state.status === 'running') {
		loopGuard++;
		if (loopGuard > maxLoop) {
			break;
		}

		const action = nextAction(state, config);

		let step: StepResult;
		switch (action.type) {
			case 'call_model': {
				// eslint-disable-next-line no-await-in-loop
				step = await handleModelCall({
					state, config, model, toolRegistry, middleware, maxMessages,
				});
				break;
			}

			case 'execute_tool': {
				// eslint-disable-next-line no-await-in-loop
				step = await handleToolExecution(
					state, action.toolCall!, toolRegistry, middleware,
				);
				break;
			}

			case 'contact_human': {
				// eslint-disable-next-line no-await-in-loop
				step = await handleHumanContact(state, action, agentInput);
				break;
			}

			case 'done': {
				step = handleDone(state, action, config, middleware);
				if (middleware) {
					const doneEvt = step.emittedEvents[0]!;
					// eslint-disable-next-line no-await-in-loop
					await middleware.runOnEvent(doneEvt, step.state);
				}

				break;
			}

			case 'error': {
				// eslint-disable-next-line no-await-in-loop
				step = await handleFatalError(state, action, config, middleware);
				break;
			}

			default: {
				step = {state, emittedEvents: []};
			}
		}

		state = step.state;
		for (const event of step.emittedEvents) {
			if (onEvent) {
				onEvent(event);
			}

			yield event;
		}
	}

	return state;
}

// ---------------------------------------------------------------------------
// runAgent — thin wrapper that drains the generator (no breaking changes)
// ---------------------------------------------------------------------------

export async function runAgent(agentInput: RunAgentInput): Promise<AgentState> {
	const generator = runAgentStream(agentInput);
	let result = await generator.next();
	while (!result.done) {
		// eslint-disable-next-line no-await-in-loop
		result = await generator.next();
	}

	return result.value;
}

// ---------------------------------------------------------------------------
// Loop step handlers
// ---------------------------------------------------------------------------

type ModelCallInput = {
	state: AgentState;
	config: AgentConfig;
	model: ModelInterface;
	toolRegistry: ToolRegistry;
	middleware?: MiddlewareStack;
	maxMessages?: number;
};

async function handleModelCall(callInput: ModelCallInput): Promise<StepResult> {
	const {state, config, model, toolRegistry, middleware, maxMessages} = callInput;
	try {
		// Build context from events
		let messages = buildContext(state.events, {
			systemPrompt: config.systemPrompt,
			maxMessages,
		});

		// Run beforeModel middleware
		if (middleware) {
			messages = await middleware.runBeforeModel(messages, state);
		}

		// Invoke model
		const tools = toolRegistry.definitions();
		const rawResult = await model.invoke(
			messages,
			tools.length > 0 ? tools : undefined,
		);

		// Validate model result
		const result = modelResultSchema.parse(rawResult);

		// Create model_response event
		const event: AgentEvent = {
			type: 'model_response',
			result,
			timestamp: Date.now(),
		};
		const newState = reduce(state, event);
		if (middleware) {
			await middleware.runOnEvent(event, newState);
		}

		return {state: newState, emittedEvents: [event]};
	} catch (error: unknown) {
		return handleError(state, error, config, middleware);
	}
}

async function handleToolExecution(
	state: AgentState,
	toolCall: ToolCall,
	toolRegistry: ToolRegistry,
	middleware: MiddlewareStack | undefined,
): Promise<StepResult> {
	const emittedEvents: AgentEvent[] = [];

	// Emit tool_call event
	const callEvent: AgentEvent = {
		type: 'tool_call',
		toolCall,
		timestamp: Date.now(),
	};
	let currentState = reduce(state, callEvent);
	emittedEvents.push(callEvent);
	if (middleware) {
		await middleware.runOnEvent(callEvent, currentState);
	}

	// Check beforeToolExecution middleware
	if (middleware) {
		const shouldExecute = await middleware.runBeforeToolExecution(
			toolCall, currentState,
		);
		if (!shouldExecute) {
			// Skipped by middleware — return a skip result
			const skipResult: AgentEvent = {
				type: 'tool_result',
				result: {
					toolCallId: toolCall.id,
					content: 'Tool execution skipped by middleware',
					isError: true,
				},
				timestamp: Date.now(),
			};
			currentState = reduce(currentState, skipResult);
			emittedEvents.push(skipResult);
			await middleware.runOnEvent(skipResult, currentState);
			return {state: currentState, emittedEvents};
		}
	}

	// Execute tool
	const toolResult = await toolRegistry.execute(toolCall);

	// Emit tool_result event
	const resultEvent: AgentEvent = {
		type: 'tool_result',
		result: toolResult,
		timestamp: Date.now(),
	};
	currentState = reduce(currentState, resultEvent);
	emittedEvents.push(resultEvent);
	if (middleware) {
		await middleware.runAfterToolExecution(toolCall, toolResult, currentState);
		await middleware.runOnEvent(resultEvent, currentState);
	}

	return {state: currentState, emittedEvents};
}

async function handleHumanContact(
	state: AgentState,
	action: AgentAction,
	agentInput: RunAgentInput,
): Promise<StepResult> {
	if (!agentInput.humanContactHandler || !action.humanRequest) {
		// No handler available — mark as done
		const doneEvent: AgentEvent = {
			type: 'done',
			reason: 'Human contact requested but no handler available',
			timestamp: Date.now(),
		};
		return {state: reduce(state, doneEvent), emittedEvents: [doneEvent]};
	}

	const response = await agentInput.humanContactHandler(action.humanRequest);

	// Inject human response as user input
	const userEvent: AgentEvent = {
		type: 'user_input',
		message: {role: 'user', content: response},
		timestamp: Date.now(),
	};
	return {state: reduce(state, userEvent), emittedEvents: [userEvent]};
}

function handleDone(
	state: AgentState,
	action: AgentAction,
	_config: AgentConfig,
	_middleware: MiddlewareStack | undefined,
): StepResult {
	const doneEvent: AgentEvent = {
		type: 'done',
		reason: action.reason ?? 'Complete',
		timestamp: Date.now(),
	};
	return {state: reduce(state, doneEvent), emittedEvents: [doneEvent]};
}

async function handleFatalError(
	state: AgentState,
	action: AgentAction,
	config: AgentConfig,
	middleware: MiddlewareStack | undefined,
): Promise<StepResult> {
	const fatalError = compactify(
		new Error(action.reason ?? 'Unknown error'),
		config.maxErrors + 1,
		config.maxErrors,
	);
	const errorEvent: AgentEvent = {
		type: 'error',
		error: fatalError,
		timestamp: Date.now(),
	};
	const newState = reduce(state, errorEvent);
	if (middleware) {
		await middleware.runOnError(fatalError, newState);
		await middleware.runOnEvent(errorEvent, newState);
	}

	return {state: newState, emittedEvents: [errorEvent]};
}

async function handleError(
	state: AgentState,
	error: unknown,
	config: AgentConfig,
	middleware: MiddlewareStack | undefined,
): Promise<StepResult> {
	const compactError = compactify(
		error,
		state.errorCount + 1,
		config.maxErrors,
	);

	const event: AgentEvent = {
		type: 'error',
		error: compactError,
		timestamp: Date.now(),
	};

	const newState = reduce(state, event);
	if (middleware) {
		await middleware.runOnError(compactError, newState);
		await middleware.runOnEvent(event, newState);
	}

	return {state: newState, emittedEvents: [event]};
}
