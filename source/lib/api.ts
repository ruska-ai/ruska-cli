import {
	type Config,
	type ApiResponse,
	type UserInfo,
	type AssistantsSearchResponse,
	type ModelsResponse,
	type CreateAssistantRequest,
	type CreateAssistantResponse,
} from '../types/index.js';

/**
 * API client for making authenticated requests to the Orchestra backend
 */
export class ApiClient {
	private readonly host: string;
	private readonly apiKey: string;

	constructor(config: Config) {
		// Remove trailing slash from host
		this.host = config.host.replace(/\/$/, '');
		this.apiKey = config.apiKey;
	}

	/**
	 * Get current user info - used to validate API key
	 */
	async getUserInfo(): Promise<ApiResponse<UserInfo>> {
		return this.request<UserInfo>('/auth/user');
	}

	/**
	 * Search/list assistants
	 */
	async searchAssistants(): Promise<ApiResponse<AssistantsSearchResponse>> {
		return this.request<AssistantsSearchResponse>('/assistants/search', {
			method: 'POST',
			body: JSON.stringify({filter: {}}),
		});
	}

	/**
	 * Get a single assistant by ID
	 */
	async getAssistant(
		id: string,
	): Promise<ApiResponse<AssistantsSearchResponse>> {
		return this.request<AssistantsSearchResponse>('/assistants/search', {
			method: 'POST',
			body: JSON.stringify({filter: {id}}),
		});
	}

	/**
	 * Create a new assistant
	 */
	async createAssistant(
		assistant: CreateAssistantRequest,
	): Promise<ApiResponse<CreateAssistantResponse>> {
		return this.request<CreateAssistantResponse>('/assistants', {
			method: 'POST',
			body: JSON.stringify(assistant),
		});
	}

	/**
	 * Make an authenticated request to the API
	 */
	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<ApiResponse<T>> {
		const url = `${this.host}/api${endpoint}`;

		try {
			const response = await fetch(url, {
				...options,
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this.apiKey,
					...options.headers,
				},
			});

			if (!response.ok) {
				const errorText = await response.text();
				let errorMessage: string;
				try {
					const errorJson = JSON.parse(errorText) as {detail?: string};
					errorMessage = errorJson.detail ?? `HTTP ${response.status}`;
				} catch {
					errorMessage = errorText || `HTTP ${response.status}`;
				}

				return {
					success: false,
					error: errorMessage,
				};
			}

			const data = (await response.json()) as T;
			return {
				success: true,
				data,
			};
		} catch (error: unknown) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : 'Unknown error occurred',
			};
		}
	}
}

/**
 * Create an API client from config
 */
export function createApiClient(config: Config): ApiClient {
	return new ApiClient(config);
}

/**
 * Validate an API key by attempting to fetch user info
 */
export async function validateApiKey(
	host: string,
	apiKey: string,
): Promise<ApiResponse<UserInfo>> {
	const client = new ApiClient({host, apiKey});
	return client.getUserInfo();
}

/**
 * Fetch available models (no auth required)
 */
export async function fetchModels(
	host: string,
	apiKey?: string,
): Promise<ApiResponse<ModelsResponse>> {
	const url = `${host.replace(/\/$/, '')}/api/llm/models`;

	try {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (apiKey) {
			headers['x-api-key'] = apiKey;
		}

		const response = await fetch(url, {headers});

		if (!response.ok) {
			const errorText = await response.text();
			let errorMessage: string;
			try {
				const errorJson = JSON.parse(errorText) as {detail?: string};
				errorMessage = errorJson.detail ?? `HTTP ${response.status}`;
			} catch {
				errorMessage = errorText || `HTTP ${response.status}`;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}

		const data = (await response.json()) as ModelsResponse;
		return {
			success: true,
			data,
		};
	} catch (error: unknown) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}
