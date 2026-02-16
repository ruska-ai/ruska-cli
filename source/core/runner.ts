/**
 * Agent Runner Factory — single entry point for CLI-level agent execution.
 * Wires model, tools, middleware, and thread together from CLI options.
 * Covers US-019.
 */

import type {StreamServiceInterface} from '../lib/services/stream-service.interface.js';
import {
	type AgentConfig,
	type AgentEvent,
	type AgentState,
	type CoreMessage,
} from './schemas.js';
import {registerBashTool} from './bash-tool.js';
import {
	type ConsentHandler,
	createBashConsentMiddleware,
} from './bash-consent-middleware.js';
import {buildContext} from './context.js';
import {createMiddlewareStack} from './middleware.js';
import {createStreamModel} from './model.js';
import {type ThreadStore} from './thread-store.js';
import {createToolRegistry} from './tool.js';
import {runAgentStream} from './agent.js';

// ---------------------------------------------------------------------------
// AgentRunnerConfig — CLI-level options for creating an agent runner
// ---------------------------------------------------------------------------

export type AgentRunnerConfig = {
	input: string;
	service: StreamServiceInterface;
	systemPrompt: string;
	maxIterations: number;
	maxErrors: number;
	enableBash: boolean;
	autoApprove: boolean;
	model?: string;
	assistantId?: string;
	threadId?: string;
	bashTimeout?: number;
	consentHandler?: ConsentHandler;
	threadStore?: ThreadStore;
};

// ---------------------------------------------------------------------------
// createAgentRunner — wires all Phase 1 primitives together
// ---------------------------------------------------------------------------

export async function createAgentRunner(
	runnerConfig: AgentRunnerConfig,
): Promise<AsyncGenerator<AgentEvent, AgentState>> {
	const {
		input,
		service,
		systemPrompt,
		maxIterations,
		maxErrors,
		enableBash,
		autoApprove,
		model: modelName,
		assistantId,
		threadId,
		consentHandler,
		threadStore,
	} = runnerConfig;

	// Build tool registry
	const toolRegistry = createToolRegistry();
	if (enableBash) {
		registerBashTool(toolRegistry);
	}

	// Build middleware stack
	const middleware = createMiddlewareStack();

	// Load thread history for continuation
	let historyMessages: CoreMessage[] = [];
	if (threadId && threadStore) {
		const thread = await threadStore.load(threadId);
		if (thread) {
			historyMessages = buildContext(thread.events(), {systemPrompt});
		}
	}

	// Add history middleware (prepends loaded thread messages before the current context)
	if (historyMessages.length > 0) {
		const history = historyMessages;
		middleware.use({
			name: 'thread-history',
			beforeModel(messages) {
				// Prepend history messages (skip system prompt if already present in current)
				const currentHasSystem = messages.length > 0
					&& messages[0]!.role === 'system';
				const historyWithoutSystem = currentHasSystem
					? history.filter(m => m.role !== 'system')
					: history;

				// Insert history after system prompt but before current messages
				if (currentHasSystem) {
					return [messages[0]!, ...historyWithoutSystem, ...messages.slice(1)];
				}

				return [...historyWithoutSystem, ...messages];
			},
		});
	}

	// Add consent middleware for bash if not auto-approving
	if (enableBash && !autoApprove && consentHandler) {
		middleware.use(createBashConsentMiddleware(consentHandler));
	}

	// Build model interface
	const modelInterface = createStreamModel({
		service,
		model: modelName,
		assistantId,
		threadId,
	});

	// Build agent config
	const agentConfig: AgentConfig = {
		systemPrompt,
		maxIterations,
		maxErrors,
	};

	// Return the async generator from runAgentStream
	return runAgentStream({
		input,
		model: modelInterface,
		toolRegistry,
		config: agentConfig,
		middleware,
	});
}
