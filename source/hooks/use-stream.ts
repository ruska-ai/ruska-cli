/**
 * React hook for consuming LLM streams
 * From Beta proposal with critical values event handling
 */

import {useState, useEffect, useRef, useCallback} from 'react';
import type {Config} from '../types/index.js';
import {
	type MessagePayload,
	type StreamRequest,
	type StreamEvent,
	type StreamHandle,
	type ValuesPayload,
} from '../types/stream.js';
import {
	StreamService,
	StreamConnectionError,
} from '../lib/services/stream-service.js';

export type StreamStatus =
	| 'idle'
	| 'connecting'
	| 'streaming'
	| 'done'
	| 'error';

export type UseStreamResult = {
	status: StreamStatus;
	events: StreamEvent[];
	messages: MessagePayload[];
	finalResponse: ValuesPayload | undefined;
	error: string | undefined;
	errorCode: number | undefined;
	abort: () => void;
};

/**
 * React hook for consuming LLM streams.
 * CRITICAL: Captures "values" event payload as finalResponse
 */
export function useStream(
	config: Config | undefined,
	request: StreamRequest | undefined,
): UseStreamResult {
	const [status, setStatus] = useState<StreamStatus>('idle');
	const [events, setEvents] = useState<StreamEvent[]>([]);
	const [messages, setMessages] = useState<MessagePayload[]>([]);
	const [finalResponse, setFinalResponse] = useState<
		ValuesPayload | undefined
	>();
	const [error, setError] = useState<string | undefined>();
	const [errorCode, setErrorCode] = useState<number | undefined>();
	const handleReference = useRef<StreamHandle | undefined>();

	const abort = useCallback(() => {
		handleReference.current?.abort();
	}, []);

	useEffect(() => {
		if (!config || !request) return;

		const service = new StreamService(config);
		let cancelled = false;

		const run = async () => {
			setStatus('connecting');
			setEvents([]);
			setMessages([]);
			setFinalResponse(undefined);
			setError(undefined);
			setErrorCode(undefined);

			try {
				const handle = await service.connect(request);
				handleReference.current = handle;

				if (cancelled) {
					handle.abort();
					return;
				}

				setStatus('streaming');

				for await (const event of handle.events) {
					if (cancelled) break;

					setEvents(previous => [...previous, event]);

					// Handle different event types
					switch (event.type) {
						case 'messages': {
							// Append message payload to messages array
							const payload = event.payload[0];
							if (payload) {
								setMessages(previous => [...previous, payload]);
							}

							break;
						}

						case 'values': {
							// CRITICAL: This is the complete final response
							setFinalResponse(event.payload);
							break;
						}

						case 'error': {
							setError(event.payload.message);
							setStatus('error');
							return;
						}

						default: {
							// Unknown event type - ignore
							break;
						}
					}
				}

				setStatus('done');
			} catch (error_: unknown) {
				if (!cancelled) {
					if (error_ instanceof StreamConnectionError) {
						setError(error_.message);
						setErrorCode(error_.statusCode);
					} else if (error_ instanceof Error) {
						setError(error_.message);
					} else {
						setError('Stream failed');
					}

					setStatus('error');
				}
			}
		};

		void run();

		return () => {
			cancelled = true;
			handleReference.current?.abort();
		};
	}, [config, request]);

	return {
		status,
		events,
		messages,
		finalResponse,
		error,
		errorCode,
		abort,
	};
}
