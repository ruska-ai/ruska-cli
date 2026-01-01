/**
 * CLI Configuration stored in ~/.ruska/auth.json
 */
export type Config = {
	apiKey: string;
	host: string;
};

/**
 * API Response wrapper for error handling
 */
export type ApiResponse<T> = {
	success: boolean;
	data?: T;
	error?: string;
};

/**
 * User info returned from /api/auth/user
 */
export type UserInfo = {
	user: {
		id: string;
		username: string;
		email: string;
		name: string | undefined;
	};
	env: Record<string, boolean>;
};

/**
 * Assistant entity from the backend
 */
export type Assistant = {
	id?: string;
	name: string;
	description?: string;
	model?: string;
	system_prompt?: string;
	instructions?: string;
	tools: string[];
	subagents?: Array<Record<string, unknown>>;
	mcp?: Record<string, unknown>;
	a2a?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	slug?: string;
	created_at?: string;
	updated_at?: string;
};

/**
 * Request body for creating an assistant
 */
export type CreateAssistantRequest = {
	name: string;
	description?: string;
	model?: string;
	system_prompt?: string;
	instructions?: string;
	tools: string[];
	subagents?: Array<Record<string, unknown>>;
	mcp?: Record<string, unknown>;
	a2a?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
};

/**
 * Response from POST /api/assistants
 */
export type CreateAssistantResponse = {
	assistant_id: string;
};

/**
 * Response from POST /api/assistants/search
 */
export type AssistantsSearchResponse = {
	assistants: Assistant[];
};

/**
 * Response from GET /api/llm/models
 */
export type ModelsResponse = {
	default: string;
	free: string[];
	models: string[];
};

/**
 * Host presets for environment selection
 */
export const hostPresets = {
	production: 'https://chat.ruska.ai',
	development: 'http://localhost:8000',
} as const;

export type HostPreset = keyof typeof hostPresets;
