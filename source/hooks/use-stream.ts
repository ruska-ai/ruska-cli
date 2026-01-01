/**
 * React hook for consuming LLM streams
 * From Beta proposal with critical values event handling
 */

import {useState, useEffect, useRef, useCallback} from 'react';
import type {Config} from '../types/index.js';
import type {
	StreamRequest,
	StreamEvent,
	StreamHandle,
	ValuesPayload,
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
	content: string;
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
	const [content, setContent] = useState('');
	const [finalResponse, setFinalResponse] = useState<
		ValuesPayload | undefined
	>();
	const [error, setError] = useState<string | undefined>();
	const [errorCode, setErrorCode] = useState<number | undefined>();
	const handleRef = useRef<StreamHandle | undefined>();

	const abort = useCallback(() => {
		handleRef.current?.abort();
	}, []);

	useEffect(() => {
		if (!config || !request) return;

		const service = new StreamService(config);
		let cancelled = false;

		const run = async () => {
			setStatus('connecting');
			setEvents([]);
			setContent('');
			setFinalResponse(undefined);
			setError(undefined);
			setErrorCode(undefined);

			try {
				const handle = await service.connect(request);
				handleRef.current = handle;

				if (cancelled) {
					handle.abort();
					return;
				}

				setStatus('streaming');
				let accumulatedContent = '';

				for await (const event of handle.events) {
					if (cancelled) break;

					setEvents(previous => [...previous, event]);

					// Handle different event types
					switch (event.type) {
						case 'messages': {
							// Accumulate content from message chunks
							if (
								event.payload.content &&
								typeof event.payload.content === 'string'
							) {
								accumulatedContent += event.payload.content;
								setContent(accumulatedContent);
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
			handleRef.current?.abort();
		};
	}, [config, request]);

	return {status, events, content, finalResponse, error, errorCode, abort};
}
