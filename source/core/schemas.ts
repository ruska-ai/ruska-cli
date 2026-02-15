/**
 * Core schemas and types for the 12-factor agent.
 * Zod schemas are the single source of truth — all types derived via z.infer.
 */

import {z} from 'zod';

// ---------------------------------------------------------------------------
// CoreMessage
// ---------------------------------------------------------------------------

export const coreMessageSchema = z.object({
	role: z.enum(['system', 'user', 'assistant', 'tool']),
	content: z.string(),
	name: z.string().optional(),
	toolCallId: z.string().optional(),
});

export type CoreMessage = z.infer<typeof coreMessageSchema>;

// ---------------------------------------------------------------------------
// ToolCall
// ---------------------------------------------------------------------------

export const toolCallSchema = z.object({
	id: z.string(),
	name: z.string(),
	args: z.record(z.string(), z.unknown()),
});

export type ToolCall = z.infer<typeof toolCallSchema>;

// ---------------------------------------------------------------------------
// ModelResult
// ---------------------------------------------------------------------------

export const modelResultSchema = z.object({
	content: z.string(),
	toolCalls: z.array(toolCallSchema).optional(),
	done: z.boolean().optional(),
});

export type ModelResult = z.infer<typeof modelResultSchema>;

// ---------------------------------------------------------------------------
// PromptTemplate
// ---------------------------------------------------------------------------

export const promptTemplateSchema = z.object({
	name: z.string(),
	version: z.string(),
	template: z.string(),
	variables: z.array(z.string()),
});

export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

// ---------------------------------------------------------------------------
// ToolParameterSchema (JSON-Schema-ish description of a parameter)
// ---------------------------------------------------------------------------

export const toolParameterSchemaSchema = z.object({
	type: z.string(),
	description: z.string().optional(),
	required: z.boolean().optional(),
});

export type ToolParameterSchema = z.infer<typeof toolParameterSchemaSchema>;

// ---------------------------------------------------------------------------
// ToolDefinition
// ---------------------------------------------------------------------------

export const toolDefinitionSchema = z.object({
	name: z.string(),
	description: z.string(),
	parameters: z.record(z.string(), toolParameterSchemaSchema),
});

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

// ---------------------------------------------------------------------------
// ToolResult
// ---------------------------------------------------------------------------

export const toolResultSchema = z.object({
	toolCallId: z.string(),
	content: z.string(),
	isError: z.boolean().optional(),
});

export type ToolResult = z.infer<typeof toolResultSchema>;

// ---------------------------------------------------------------------------
// HumanContactRequest
// ---------------------------------------------------------------------------

export const humanContactRequestSchema = z.object({
	message: z.string(),
	context: z.string().optional(),
	urgency: z.enum(['low', 'medium', 'high']).optional(),
});

export type HumanContactRequest = z.infer<typeof humanContactRequestSchema>;

// ---------------------------------------------------------------------------
// CompactError
// ---------------------------------------------------------------------------

export const compactErrorSchema = z.object({
	message: z.string(),
	code: z.string().optional(),
	attempt: z.number(),
	maxAttempts: z.number(),
	recoverable: z.boolean(),
	timestamp: z.number(),
});

export type CompactError = z.infer<typeof compactErrorSchema>;

// ---------------------------------------------------------------------------
// AgentEvent — discriminated union
// ---------------------------------------------------------------------------

export const userInputEventSchema = z.object({
	type: z.literal('user_input'),
	message: coreMessageSchema,
	timestamp: z.number(),
});

export const modelResponseEventSchema = z.object({
	type: z.literal('model_response'),
	result: modelResultSchema,
	timestamp: z.number(),
});

export const toolCallEventSchema = z.object({
	type: z.literal('tool_call'),
	toolCall: toolCallSchema,
	timestamp: z.number(),
});

export const toolResultEventSchema = z.object({
	type: z.literal('tool_result'),
	result: toolResultSchema,
	timestamp: z.number(),
});

export const errorEventSchema = z.object({
	type: z.literal('error'),
	error: compactErrorSchema,
	timestamp: z.number(),
});

export const humanContactEventSchema = z.object({
	type: z.literal('human_contact'),
	request: humanContactRequestSchema,
	timestamp: z.number(),
});

export const doneEventSchema = z.object({
	type: z.literal('done'),
	reason: z.string(),
	timestamp: z.number(),
});

export const agentEventSchema = z.discriminatedUnion('type', [
	userInputEventSchema,
	modelResponseEventSchema,
	toolCallEventSchema,
	toolResultEventSchema,
	errorEventSchema,
	humanContactEventSchema,
	doneEventSchema,
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;

// ---------------------------------------------------------------------------
// AgentState
// ---------------------------------------------------------------------------

export const agentStateSchema = z.object({
	status: z.enum([
		'idle',
		'running',
		'waiting_for_human',
		'done',
		'error',
	]),
	events: z.array(agentEventSchema),
	iterations: z.number(),
	errorCount: z.number(),
});

export type AgentState = z.infer<typeof agentStateSchema>;

// ---------------------------------------------------------------------------
// AgentConfig
// ---------------------------------------------------------------------------

export const agentConfigSchema = z.object({
	systemPrompt: z.string(),
	maxIterations: z.number().int().positive(),
	maxErrors: z.number().int().nonnegative(),
	tools: z.array(toolDefinitionSchema).optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

// ---------------------------------------------------------------------------
// AgentAction
// ---------------------------------------------------------------------------

export const agentActionSchema = z.object({
	type: z.enum([
		'call_model',
		'execute_tool',
		'contact_human',
		'done',
		'error',
	]),
	toolCall: toolCallSchema.optional(),
	humanRequest: humanContactRequestSchema.optional(),
	reason: z.string().optional(),
});

export type AgentAction = z.infer<typeof agentActionSchema>;

// ---------------------------------------------------------------------------
// Validation helpers — strict (throws) and safe (returns result)
// ---------------------------------------------------------------------------

export const validateCoreMessage = (data: unknown): CoreMessage =>
	coreMessageSchema.parse(data);
export const safeValidateCoreMessage = (data: unknown) =>
	coreMessageSchema.safeParse(data);

export const validateToolCall = (data: unknown): ToolCall =>
	toolCallSchema.parse(data);
export const safeValidateToolCall = (data: unknown) =>
	toolCallSchema.safeParse(data);

export const validateModelResult = (data: unknown): ModelResult =>
	modelResultSchema.parse(data);
export const safeValidateModelResult = (data: unknown) =>
	modelResultSchema.safeParse(data);

export const validatePromptTemplate = (data: unknown): PromptTemplate =>
	promptTemplateSchema.parse(data);
export const safeValidatePromptTemplate = (data: unknown) =>
	promptTemplateSchema.safeParse(data);

export const validateToolParameterSchema = (
	data: unknown,
): ToolParameterSchema => toolParameterSchemaSchema.parse(data);
export const safeValidateToolParameterSchema = (data: unknown) =>
	toolParameterSchemaSchema.safeParse(data);

export const validateToolDefinition = (data: unknown): ToolDefinition =>
	toolDefinitionSchema.parse(data);
export const safeValidateToolDefinition = (data: unknown) =>
	toolDefinitionSchema.safeParse(data);

export const validateToolResult = (data: unknown): ToolResult =>
	toolResultSchema.parse(data);
export const safeValidateToolResult = (data: unknown) =>
	toolResultSchema.safeParse(data);

export const validateHumanContactRequest = (
	data: unknown,
): HumanContactRequest => humanContactRequestSchema.parse(data);
export const safeValidateHumanContactRequest = (data: unknown) =>
	humanContactRequestSchema.safeParse(data);

export const validateCompactError = (data: unknown): CompactError =>
	compactErrorSchema.parse(data);
export const safeValidateCompactError = (data: unknown) =>
	compactErrorSchema.safeParse(data);

export const validateAgentEvent = (data: unknown): AgentEvent =>
	agentEventSchema.parse(data);
export const safeValidateAgentEvent = (data: unknown) =>
	agentEventSchema.safeParse(data);

export const validateAgentState = (data: unknown): AgentState =>
	agentStateSchema.parse(data);
export const safeValidateAgentState = (data: unknown) =>
	agentStateSchema.safeParse(data);

export const validateAgentConfig = (data: unknown): AgentConfig =>
	agentConfigSchema.parse(data);
export const safeValidateAgentConfig = (data: unknown) =>
	agentConfigSchema.safeParse(data);

export const validateAgentAction = (data: unknown): AgentAction =>
	agentActionSchema.parse(data);
export const safeValidateAgentAction = (data: unknown) =>
	agentActionSchema.safeParse(data);
