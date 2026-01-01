/**
 * Output formatter for CLI stream command
 * Simplified from Gamma proposal (no timestamps/sequence for MVP)
 */

import type {
	ChunkOutput,
	DoneOutput,
	ErrorOutput,
	ErrorCode,
} from '../../types/output.js';
import type {ValuesPayload} from '../../types/stream.js';

/**
 * Output formatter class to track accumulated content
 */
export class OutputFormatter {
	private accumulated = '';

	/**
	 * Format a content chunk
	 */
	chunk(content: string): ChunkOutput {
		this.accumulated += content;
		return {
			type: 'chunk',
			content,
		};
	}

	/**
	 * Get accumulated content
	 */
	getAccumulated(): string {
		return this.accumulated;
	}

	/**
	 * Format the final done event with values payload
	 */
	done(valuesPayload: ValuesPayload): DoneOutput {
		return {
			type: 'done',
			response: valuesPayload,
		};
	}

	/**
	 * Format an error
	 */
	error(code: ErrorCode, message: string): ErrorOutput {
		return {
			type: 'error',
			code,
			message,
		};
	}
}
