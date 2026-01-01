import {
	type ChatMessage,
	type StreamRequest,
	type StreamResponse,
	type Config,
} from '../types/index.js';

/**
 * Options for creating a stream request
 */
export type StreamOptions = {
	model?: string;
	assistantId?: string;
	systemPrompt?: string;
	tools?: string[];
	history?: ChatMessage[];
};

/**
 * Create a StreamRequest payload from a user message and options
 */
export function createStreamRequest(
	message: string,
	options: StreamOptions = {},
): StreamRequest {
	const {model, assistantId, systemPrompt, tools, history = []} = options;

	const messages: ChatMessage[] = [
		...history,
		{role: 'user', content: message},
	];

	const request: StreamRequest = {
		input: {messages},
	};

	if (model) {
		request.model = model;
	}

	if (systemPrompt) {
		request.system_prompt = systemPrompt;
	}

	if (tools && tools.length > 0) {
		request.tools = tools;
	}

	if (assistantId) {
		request.metadata = {
			...request.metadata,
			// eslint-disable-next-line @typescript-eslint/naming-convention -- API requires snake_case
			assistant_id: assistantId,
		};
	}

	return request;
}

/**
 * Parse an SSE event data string into a StreamResponse
 */
export function parseStreamEvent(eventData: string): StreamResponse {
	if (!eventData || eventData.trim() === '') {
		return {
			type: 'error',
			error: 'Empty event data',
		};
	}

	try {
		const parsed = JSON.parse(eventData) as unknown[];

		if (!Array.isArray(parsed) || parsed.length < 2) {
			return {
				type: 'error',
				error: 'Invalid event format',
			};
		}

		const [streamMode, data] = parsed;

		if (streamMode === 'messages') {
			return {
				type: 'messages',
				data,
			};
		}

		if (streamMode === 'values') {
			return {
				type: 'values',
				data,
			};
		}

		if (streamMode === 'error') {
			return {
				type: 'error',
				error: typeof data === 'string' ? data : JSON.stringify(data),
			};
		}

		return {
			type: 'unknown',
			data,
		};
	} catch {
		return {
			type: 'error',
			error: 'Failed to parse event data',
		};
	}
}

/**
 * Extract text content from a stream payload
 */
export function extractContentFromPayload(payload: unknown): string {
	if (!payload || typeof payload !== 'object') {
		return '';
	}

	const record = payload as Record<string, unknown>;
	const {content} = record;

	if (typeof content === 'string') {
		return content;
	}

	if (Array.isArray(content)) {
		// Handle array format: [{type: 'text', text: '...'}]
		for (const item of content) {
			if (
				item &&
				typeof item === 'object' &&
				'type' in item &&
				item.type === 'text' &&
				'text' in item
			) {
				return String(item.text);
			}
		}
	}

	return '';
}

/**
 * Callback type for stream events
 */
export type StreamCallback = {
	onToken: (token: string) => void;
	onError: (error: string) => void;
	onComplete: () => void;
};

/**
 * Process a single SSE line
 */
function processSseLine(
	line: string,
	accumulatedContent: {value: string},
	callbacks: StreamCallback,
): void {
	if (!line.startsWith('data: ')) {
		return;
	}

	const data = line.slice(6);
	const parsed = parseStreamEvent(data);

	if (parsed.type === 'error') {
		callbacks.onError(parsed.error ?? 'Unknown error');
		return;
	}

	if (parsed.type === 'messages' && parsed.data) {
		const messageData = parsed.data as unknown[];
		if (Array.isArray(messageData) && messageData.length > 0) {
			const content = extractContentFromPayload(messageData[0]);
			if (content) {
				const newContent = content.slice(accumulatedContent.value.length);
				if (newContent) {
					accumulatedContent.value = content;
					callbacks.onToken(newContent);
				}
			}
		}
	}
}

/**
 * Process buffered lines
 */
function processBufferedLines(
	lines: string[],
	accumulatedContent: {value: string},
	callbacks: StreamCallback,
): void {
	for (const line of lines) {
		if (line.trim()) {
			processSseLine(line, accumulatedContent, callbacks);
		}
	}
}

/**
 * Read and process SSE stream
 */
async function processSseStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	callbacks: StreamCallback,
): Promise<void> {
	const decoder = new TextDecoder();
	let buffer = '';
	const accumulatedContent = {value: ''};

	let done = false;
	while (!done) {
		// eslint-disable-next-line no-await-in-loop -- Sequential stream processing required
		const result = await reader.read();
		done = result.done;

		if (done) {
			// Process remaining buffer
			const remainingLines = buffer.trim() ? buffer.split('\n') : [];
			processBufferedLines(remainingLines, accumulatedContent, callbacks);
			callbacks.onComplete();
			break;
		}

		buffer += decoder.decode(result.value, {stream: true});

		// Process complete lines
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		processBufferedLines(lines, accumulatedContent, callbacks);
	}
}

/**
 * Stream chat messages from the API using fetch with ReadableStream
 * Returns an abort controller to cancel the stream
 */
export async function streamChat(
	config: Config,
	request: StreamRequest,
	callbacks: StreamCallback,
): Promise<AbortController> {
	const controller = new AbortController();
	const url = `${config.host.replace(/\/$/, '')}/api/llm/stream`;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				// eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
				Accept: 'text/event-stream',
				'x-api-key': config.apiKey,
			},
			body: JSON.stringify(request),
			signal: controller.signal,
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

			callbacks.onError(errorMessage);
			return controller;
		}

		if (!response.body) {
			callbacks.onError('No response body');
			return controller;
		}

		const reader = response.body.getReader();

		try {
			await processSseStream(reader, callbacks);
		} catch (error: unknown) {
			if (error instanceof Error && error.name === 'AbortError') {
				callbacks.onComplete();
			} else {
				callbacks.onError(
					error instanceof Error ? error.message : 'Stream error',
				);
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error && error.name === 'AbortError') {
			callbacks.onComplete();
		} else {
			callbacks.onError(
				error instanceof Error ? error.message : 'Connection error',
			);
		}
	}

	return controller;
}
