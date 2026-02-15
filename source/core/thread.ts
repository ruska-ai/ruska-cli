/**
 * Thread / Event Log — append-only event log as the single source of truth
 * for agent history. Supports serialization and deserialization for resumption.
 * Covers US-006.
 */

import {
	type AgentEvent,
	agentEventSchema,
} from './schemas.js';

export type Thread = {
	/** Number of events in the log. */
	readonly length: number;
	/** Append a validated event to the log. */
	append(event: AgentEvent): void;
	/** Return a copy of all events. */
	events(): AgentEvent[];
	/** Return events matching a specific discriminator type. */
	eventsOfType<T extends AgentEvent['type']>(
		type: T,
	): Array<Extract<AgentEvent, {type: T}>>;
	/** Serialize the thread to a JSON string. */
	serialize(): string;
};

/**
 * Create a new append-only event log, optionally seeded with initial events.
 * Each appended event is validated against AgentEventSchema.
 */
export function createThread(initial?: AgentEvent[]): Thread {
	const log: AgentEvent[] = [];

	if (initial) {
		for (const event of initial) {
			log.push(agentEventSchema.parse(event));
		}
	}

	return {
		append(event: AgentEvent) {
			log.push(agentEventSchema.parse(event));
		},

		events() {
			return [...log];
		},

		eventsOfType<T extends AgentEvent['type']>(
			type: T,
		): Array<Extract<AgentEvent, {type: T}>> {
			return log.filter(
				(e): e is Extract<AgentEvent, {type: T}> => e.type === type,
			);
		},

		get length() {
			return log.length;
		},

		serialize() {
			return JSON.stringify(log);
		},
	};
}

/**
 * Hydrate a Thread from a JSON string produced by thread.serialize().
 * Each event is re-validated on deserialization.
 */
export function deserializeThread(json: string): Thread {
	const raw: unknown = JSON.parse(json);
	if (!Array.isArray(raw)) {
		throw new TypeError('Expected an array of events');
	}

	const events: AgentEvent[] = raw.map(
		(item: unknown) => agentEventSchema.parse(item),
	);

	return createThread(events);
}
