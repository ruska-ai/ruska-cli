/**
 * Thread Filesystem Persistence — save, load, list, and delete threads on disk
 * so that the CLI's -t <thread-id> flag can resume previous conversations.
 * Covers US-018.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {type Thread, deserializeThread} from './thread.js';

/**
 * Persistent storage interface for threads.
 */
export type ThreadStore = {
	/** Persist a thread to storage. */
	save(id: string, thread: Thread): Promise<void>;
	/** Load a thread by ID, or undefined if it does not exist. */
	load(id: string): Promise<Thread | undefined>;
	/** List all stored thread IDs. */
	list(): Promise<string[]>;
	/** Delete a thread by ID. */
	delete(id: string): Promise<void>;
};

/**
 * Create a ThreadStore backed by the local filesystem.
 * Each thread is stored as a JSON file named `<id>.json` inside `dir`.
 */
export function createFileThreadStore(
	dir?: string,
): ThreadStore {
	const resolvedDir = dir ?? path.join(os.homedir(), '.ruska', 'threads');

	return {
		async save(id: string, thread: Thread): Promise<void> {
			await fs.promises.mkdir(resolvedDir, {recursive: true});
			const filePath = path.join(resolvedDir, `${id}.json`);
			await fs.promises.writeFile(filePath, thread.serialize(), 'utf8');
		},

		async load(id: string): Promise<Thread | undefined> {
			const filePath = path.join(resolvedDir, `${id}.json`);
			try {
				const json = await fs.promises.readFile(filePath, 'utf8');
				return deserializeThread(json);
			} catch {
				return undefined;
			}
		},

		async list(): Promise<string[]> {
			try {
				const entries = await fs.promises.readdir(resolvedDir);
				return entries
					.filter(entry => entry.endsWith('.json'))
					.map(entry => entry.replace(/\.json$/, ''));
			} catch {
				return [];
			}
		},

		async delete(id: string): Promise<void> {
			const filePath = path.join(resolvedDir, `${id}.json`);
			try {
				await fs.promises.unlink(filePath);
			} catch {
				// Ignore if file does not exist
			}
		},
	};
}
