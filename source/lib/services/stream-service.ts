/**
 * Stream service implementation for SSE consumption
 * Supports both sync mode (HTTP 200) and distributed worker mode (HTTP 202)
 * @see backend/src/routes/v0/llm.py - distributed mode detection
 * @see backend/src/routes/v0/thread.py - thread stream endpoint
 */

import type {Config} from '../../types/index.js';
import {
	type StreamRequest,
	type StreamHandle,
	type StreamEvent,
	isDistributedResponse,
	isDistributedError,
	STREAM_DONE_MARKER,
} from '../../types/stream.js';
import type {StreamServiceInterface} from './stream-service.interface.js';

const defaultConnectionTimeoutMs = 30_000;
const defaultStreamIdleTimeoutMs = 60_000;

/**
 * Custom error for stream connection failures
 */
export class StreamConnectionError extends Error {
	constructor(message: string, public readonly statusCode: number) {
		super(message);
		this.name = 'StreamConnectionError';
	}
}

/**
 * Error specific to distributed streaming mode
 * Includes phase information for debugging
 */
export class DistributedStreamError extends Error {
	constructor(
		message: string,
		public readonly phase: 'handshake' | 'streaming',
		public readonly rawResponse?: string,
	) {
		super(message);
		this.name = 'DistributedStreamError';
	}
}

/**
 * Error for malformed distributed response from initial POST
 */
export class MalformedDistributedResponse extends Error {
	constructor(message: string, public readonly rawResponse?: string) {
		super(message);
		this.name = 'MalformedDistributedResponse';
	}
}

/**
 * Production stream service using SSE
 */
export class StreamService implements StreamServiceInterface {
	private readonly host: string;
	private readonly apiKey: string;
	private readonly connectionTimeoutMs: number;
	private readonly streamIdleTimeoutMs: number;

	constructor(
		config: Config,
		connectionTimeoutMs: number = defaultConnectionTimeoutMs,
		streamIdleTimeoutMs: number = defaultStreamIdleTimeoutMs,
	) {
		this.host = config.host.replace(/\/$/, '');
		this.apiKey = config.apiKey;
		this.connectionTimeoutMs = connectionTimeoutMs;
		this.streamIdleTimeoutMs = streamIdleTimeoutMs;
	}

	async connect(request: StreamRequest): Promise<StreamHandle> {
		const controller = new AbortController();

		// Set timeout for connection
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, this.connectionTimeoutMs);

		try {
			const response = await this.fetchStream(request, controller.signal);
			clearTimeout(timeoutId);

			// Check for distributed mode (HTTP 202)
			if (response.status === 202) {
				return await this.handleDistributedMode(response, controller);
			}

			// Sync mode (HTTP 200)
			if (!response.body) {
				throw new StreamConnectionError('No response body', 0);
			}

			const events = this.parseEventStream(response.body);

			return {
				events,
				abort() {
					controller.abort();
				},
			};
		} catch (error: unknown) {
			clearTimeout(timeoutId);
			throw error;
		}
	}

	private async fetchStream(
		request: StreamRequest,
		signal: AbortSignal,
	): Promise<Response> {
		const url = `${this.host}/api/llm/stream`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.apiKey,
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Accept: 'text/event-stream',
			},
			body: JSON.stringify(request),
			signal,
		});

		// Accept both 200 (sync) and 202 (distributed) as valid
		if (!response.ok && response.status !== 202) {
			const error = await this.parseError(response);
			throw new StreamConnectionError(error, response.status);
		}

		return response;
	}

	/**
	 * Handle distributed worker mode (HTTP 202 response)
	 * Parses the initial response and connects to thread stream endpoint
	 */
	private async handleDistributedMode(
		initialResponse: Response,
		controller: AbortController,
	): Promise<StreamHandle> {
		// Parse the distributed response body
		const rawText = await initialResponse.text();
		let data: unknown;

		try {
			data = JSON.parse(rawText);
		} catch {
			throw new MalformedDistributedResponse(
				'Invalid JSON in distributed response',
				rawText,
			);
		}

		// Validate the response shape
		if (!isDistributedResponse(data)) {
			throw new MalformedDistributedResponse(
				'Invalid distributed response: missing or invalid thread_id',
				rawText,
			);
		}

		// Check if already aborted before making second request
		if (controller.signal.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}

		// Connect to the thread stream endpoint
		const streamHandle = await this.connectToThreadStream(
			data.thread_id,
			controller,
		);

		return streamHandle;
	}

	/**
	 * Connect to GET /api/threads/{thread_id}/stream for distributed mode
	 * URL-encodes thread_id to prevent path injection
	 */
	private async connectToThreadStream(
		threadId: string,
		controller: AbortController,
	): Promise<StreamHandle> {
		// URL-encode thread_id to prevent path injection
		const encodedThreadId = encodeURIComponent(threadId);
		const streamUrl = `${this.host}/api/threads/${encodedThreadId}/stream`;

		// Set connection timeout for the GET request
		const connectionTimeoutId = setTimeout(() => {
			controller.abort();
		}, this.connectionTimeoutMs);

		try {
			const streamResponse = await fetch(streamUrl, {
				method: 'GET',
				headers: {
					'x-api-key': this.apiKey,
					// eslint-disable-next-line @typescript-eslint/naming-convention
					Accept: 'text/event-stream',
				},
				signal: controller.signal,
			});

			clearTimeout(connectionTimeoutId);

			if (!streamResponse.ok) {
				const error = await this.parseError(streamResponse);
				throw new DistributedStreamError(
					`Failed to connect to thread stream: ${error}`,
					'handshake',
				);
			}

			if (!streamResponse.body) {
				throw new DistributedStreamError(
					'No response body from thread stream',
					'handshake',
				);
			}

			const events = this.parseDistributedEventStream(
				streamResponse.body,
				controller,
			);

			return {
				events,
				abort() {
					controller.abort();
				},
			};
		} catch (error: unknown) {
			clearTimeout(connectionTimeoutId);
			throw error;
		}
	}

	/**
	 * Parse SSE events from distributed worker stream
	 * Handles [DONE] marker, keep-alive comments, and error JSON
	 */
	private async *parseDistributedEventStream(
		body: ReadableStream<Uint8Array>,
		controller: AbortController,
	): AsyncGenerator<StreamEvent> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let idleTimeoutId: ReturnType<typeof setTimeout> | undefined;

		// Reset idle timeout on data
		const resetIdleTimeout = () => {
			if (idleTimeoutId) {
				clearTimeout(idleTimeoutId);
			}

			idleTimeoutId = setTimeout(() => {
				controller.abort();
			}, this.streamIdleTimeoutMs);
		};

		try {
			resetIdleTimeout();

			while (true) {
				// eslint-disable-next-line no-await-in-loop
				const {done, value} = await reader.read();
				if (done) break;

				// Reset idle timeout on any data received
				resetIdleTimeout();

				buffer += decoder.decode(value, {stream: true});
				const result = this.extractDistributedEvents(buffer);
				buffer = result.remaining;

				for (const event of result.parsed) {
					// Check for terminal [DONE] marker
					if (event.type === 'done') {
						return;
					}

					yield event;
				}
			}

			// Process any remaining buffer
			if (buffer.trim()) {
				const result = this.extractDistributedEvents(buffer + '\n');
				for (const event of result.parsed) {
					if (event.type === 'done') {
						return;
					}

					yield event;
				}
			}
		} finally {
			if (idleTimeoutId) {
				clearTimeout(idleTimeoutId);
			}

			reader.releaseLock();
		}
	}

	/**
	 * Extract events from distributed stream buffer
	 * Handles keep-alive comments, [DONE] marker, and error JSON
	 */
	private extractDistributedEvents(buffer: string): {
		parsed: StreamEvent[];
		remaining: string;
	} {
		const parsed: StreamEvent[] = [];
		const lines = buffer.split('\n');
		let remaining = '';

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;

			// Incomplete line at end (no newline after it)
			if (i === lines.length - 1 && !buffer.endsWith('\n')) {
				remaining = line;
				break;
			}

			// Skip empty lines (SSE event separator)
			if (line.trim() === '') {
				continue;
			}

			// Skip keep-alive comments (lines starting with :)
			if (line.startsWith(':')) {
				continue;
			}

			// Parse data lines
			if (line.startsWith('data: ')) {
				const data = line.slice(6);

				// Check for [DONE] marker
				if (data === STREAM_DONE_MARKER) {
					parsed.push({type: 'done', payload: undefined});
					continue;
				}

				// Try to parse as JSON
				const event = this.parseDistributedEvent(data);
				if (event) {
					parsed.push(event);
				}
			}
		}

		return {parsed, remaining};
	}

	/**
	 * Parse a single distributed event data payload
	 * Handles error JSON format and regular event format
	 */
	private parseDistributedEvent(data: string): StreamEvent | undefined {
		try {
			const parsed = JSON.parse(data) as unknown;

			// Check for distributed error format: {"error": "..."}
			if (isDistributedError(parsed)) {
				return {
					type: 'error',
					payload: {message: parsed.error},
				};
			}

			// Regular event format: [type, payload]
			if (Array.isArray(parsed) && parsed.length >= 2) {
				const [type, payload] = parsed;
				// Type assertion needed because we're parsing dynamic SSE data
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				return {type, payload} as StreamEvent;
			}

			// Unknown format - skip
			return undefined;
		} catch {
			// Parse error - skip this event
			return undefined;
		}
	}

	private async *parseEventStream(
		body: ReadableStream<Uint8Array>,
	): AsyncGenerator<StreamEvent> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				// Await in loop is intentional for streaming SSE events
				// eslint-disable-next-line no-await-in-loop
				const {done, value} = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, {stream: true});
				const result = this.extractEvents(buffer);
				buffer = result.remaining;

				for (const event of result.parsed) {
					yield event;
				}
			}

			// Process any remaining buffer
			if (buffer.trim()) {
				const result = this.extractEvents(buffer + '\n');
				for (const event of result.parsed) {
					yield event;
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	private extractEvents(buffer: string): {
		parsed: StreamEvent[];
		remaining: string;
	} {
		const parsed: StreamEvent[] = [];
		const lines = buffer.split('\n');
		let remaining = '';

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;

			// Incomplete line at end (no newline after it)
			if (i === lines.length - 1 && !buffer.endsWith('\n')) {
				remaining = line;
				break;
			}

			// Skip empty lines (SSE event separator)
			if (line.trim() === '') {
				continue;
			}

			// Parse data lines
			if (line.startsWith('data: ')) {
				const event = this.parseEvent(line.slice(6));
				if (event) {
					parsed.push(event);
				}
			}
		}

		return {parsed, remaining};
	}

	private parseEvent(data: string): StreamEvent | undefined {
		try {
			const parsed = JSON.parse(data) as [string, unknown];
			const [type, payload] = parsed;
			// Type assertion needed because we're parsing dynamic SSE data
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			return {type, payload} as StreamEvent;
		} catch {
			// Parse error - skip this event
			return undefined;
		}
	}

	private async parseError(response: Response): Promise<string> {
		try {
			const text = await response.text();
			const json = JSON.parse(text) as {detail?: string; error?: string};
			return json.detail ?? json.error ?? `HTTP ${response.status}`;
		} catch {
			return `HTTP ${response.status}`;
		}
	}
}
