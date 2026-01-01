/**
 * Stream service interface for dependency injection
 */

import type {StreamRequest, StreamHandle} from '../../types/stream.js';

/**
 * Abstract interface for stream services.
 * Allows swapping implementations for testing or alternative backends.
 */
export type StreamServiceInterface = {
	/**
	 * Establish a streaming connection to the LLM endpoint
	 */
	connect(request: StreamRequest): Promise<StreamHandle>;
};
