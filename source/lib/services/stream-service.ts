/**
 * Stream service implementation for SSE consumption
 * Combines Beta's architecture with Alpha's timeout handling
 */

import type {Config} from '../../types/index.js';
import type {
	StreamRequest,
	StreamHandle,
	StreamEvent,
} from '../../types/stream.js';
import type {StreamServiceInterface} from './stream-service.interface.js';

const defaultTimeoutMs = 30_000;

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
 * Production stream service using SSE
 */
export class StreamService implements StreamServiceInterface {
	private readonly host: string;
	private readonly apiKey: string;
	private readonly timeoutMs: number;

	constructor(config: Config, timeoutMs: number = defaultTimeoutMs) {
		this.host = config.host.replace(/\/$/, '');
		this.apiKey = config.apiKey;
		this.timeoutMs = timeoutMs;
	}

	async connect(request: StreamRequest): Promise<StreamHandle> {
		const controller = new AbortController();

		// Set timeout for connection
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, this.timeoutMs);

		try {
			const response = await this.fetchStream(request, controller.signal);
			clearTimeout(timeoutId);

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

		if (!response.ok) {
			const error = await this.parseError(response);
			throw new StreamConnectionError(error, response.status);
		}

		return response;
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
