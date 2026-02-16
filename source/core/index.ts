// Schemas & types
export {
	coreMessageSchema,
	type CoreMessage,
	toolCallSchema,
	type ToolCall,
	modelResultSchema,
	type ModelResult,
	promptTemplateSchema,
	type PromptTemplate,
	toolParameterSchemaSchema,
	type ToolParameterSchema,
	toolDefinitionSchema,
	type ToolDefinition,
	toolResultSchema,
	type ToolResult,
	humanContactRequestSchema,
	type HumanContactRequest,
	compactErrorSchema,
	type CompactError,
	userInputEventSchema,
	modelResponseEventSchema,
	toolCallEventSchema,
	toolResultEventSchema,
	errorEventSchema,
	humanContactEventSchema,
	doneEventSchema,
	agentEventSchema,
	type AgentEvent,
	agentStateSchema,
	type AgentState,
	agentConfigSchema,
	type AgentConfig,
	agentActionSchema,
	type AgentAction,
	validateCoreMessage,
	safeValidateCoreMessage,
	validateToolCall,
	safeValidateToolCall,
	validateModelResult,
	safeValidateModelResult,
	validatePromptTemplate,
	safeValidatePromptTemplate,
	validateToolParameterSchema,
	safeValidateToolParameterSchema,
	validateToolDefinition,
	safeValidateToolDefinition,
	validateToolResult,
	safeValidateToolResult,
	validateHumanContactRequest,
	safeValidateHumanContactRequest,
	validateCompactError,
	safeValidateCompactError,
	validateAgentEvent,
	safeValidateAgentEvent,
	validateAgentState,
	safeValidateAgentState,
	validateAgentConfig,
	safeValidateAgentConfig,
	validateAgentAction,
	safeValidateAgentAction,
} from './schemas.js';

// Agent loop
export {
	type RunAgentInput,
	type RunAgentStreamInput,
	initialState,
	reduce,
	nextAction,
	runAgent,
	runAgentStream,
} from './agent.js';

// Model interface
export {
	type ModelInterface,
	type StreamModelConfig,
	coreToStreamMessage,
	streamToolCallsToCoreToolCalls,
	createStreamModel,
} from './model.js';

// Tool registry
export {
	type ToolExecutor,
	type ToolRegistry,
	createToolRegistry,
	defineTool,
} from './tool.js';

// Bash tool
export {
	bashToolDefinition,
	createBashExecutor,
	registerBashTool,
} from './bash-tool.js';

// Middleware
export {
	type Middleware,
	type MiddlewareStack,
	createMiddlewareStack,
} from './middleware.js';

// Context builder
export {
	type BuildContextOptions,
	buildContext,
	estimateTokens,
} from './context.js';

// Thread / event log
export {
	type Thread,
	createThread,
	deserializeThread,
} from './thread.js';

// Prompt manager
export {
	renderPrompt,
	createPromptTemplate,
	renderTemplate,
} from './prompt.js';

// Compact errors
export {
	compactify,
	isRecoverable,
	formatForContext,
} from './errors.js';

// Human contact tool
export {
	type HumanContactHandler,
	humanContactToolDefinition,
	parseHumanContactArgs,
} from './human.js';

// Bash consent middleware
export {
	type ConsentDecision,
	type ConsentHandler,
	createBashConsentMiddleware,
} from './bash-consent-middleware.js';
