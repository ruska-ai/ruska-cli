/**
 * Tests for Thread Filesystem Persistence.
 * Covers US-018: Implement Thread Filesystem Persistence
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'ava';
import {type AgentEvent} from '../core/schemas.js';
import {createThread} from '../core/thread.js';
import {createFileThreadStore} from '../core/thread-store.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const userInputEvent: AgentEvent = {
	type: 'user_input',
	message: {role: 'user', content: 'hello'},
	timestamp: 1000,
};

const modelResponseEvent: AgentEvent = {
	type: 'model_response',
	result: {content: 'hi there', done: false},
	timestamp: 2000,
};

const doneEvent: AgentEvent = {
	type: 'done',
	reason: 'task complete',
	timestamp: 3000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'thread-store-test-'));
}

function cleanupDir(dir: string): void {
	fs.rmSync(dir, {recursive: true, force: true});
}

// =============================================================================
// save / load — roundtrip
// =============================================================================

test('save and load roundtrip preserves thread events', async t => {
	const dir = makeTempDir();
	t.teardown(() => {
		cleanupDir(dir);
	});

	const store = createFileThreadStore(dir);
	const thread = createThread([userInputEvent, modelResponseEvent]);

	await store.save('thread-1', thread);
	const loaded = await store.load('thread-1');

	t.not(loaded, undefined);
	t.is(loaded!.length, 2);
	t.deepEqual(loaded!.events(), [userInputEvent, modelResponseEvent]);
});

test('save overwrites existing thread', async t => {
	const dir = makeTempDir();
	t.teardown(() => {
		cleanupDir(dir);
	});

	const store = createFileThreadStore(dir);

	const original = createThread([userInputEvent]);
	await store.save('thread-1', original);

	const updated = createThread([userInputEvent, modelResponseEvent, doneEvent]);
	await store.save('thread-1', updated);

	const loaded = await store.load('thread-1');
	t.not(loaded, undefined);
	t.is(loaded!.length, 3);
});

test('save creates directory if it does not exist', async t => {
	const dir = path.join(makeTempDir(), 'nested', 'threads');
	t.teardown(() => {
		cleanupDir(path.resolve(dir, '..', '..'));
	});

	const store = createFileThreadStore(dir);
	const thread = createThread([userInputEvent]);

	await store.save('thread-1', thread);
	const loaded = await store.load('thread-1');
	t.not(loaded, undefined);
	t.is(loaded!.length, 1);
});

// =============================================================================
// load — non-existent
// =============================================================================

test('load returns undefined for non-existent thread', async t => {
	const dir = makeTempDir();
	t.teardown(() => {
		cleanupDir(dir);
	});

	const store = createFileThreadStore(dir);
	const result = await store.load('does-not-exist');
	t.is(result, undefined);
});

test('load returns undefined when directory does not exist', async t => {
	const dir = path.join(os.tmpdir(), 'nonexistent-thread-store-test-' + Date.now().toString());
	const store = createFileThreadStore(dir);
	const result = await store.load('thread-1');
	t.is(result, undefined);
});

// =============================================================================
// list
// =============================================================================

test('list returns stored thread IDs', async t => {
	const dir = makeTempDir();
	t.teardown(() => {
		cleanupDir(dir);
	});

	const store = createFileThreadStore(dir);

	await store.save('alpha', createThread([userInputEvent]));
	await store.save('beta', createThread([modelResponseEvent]));
	await store.save('gamma', createThread([doneEvent]));

	const ids = await store.list();
	t.is(ids.length, 3);
	t.true(ids.includes('alpha'));
	t.true(ids.includes('beta'));
	t.true(ids.includes('gamma'));
});

test('list returns empty array when no threads exist', async t => {
	const dir = makeTempDir();
	t.teardown(() => {
		cleanupDir(dir);
	});

	const store = createFileThreadStore(dir);
	const ids = await store.list();
	t.deepEqual(ids, []);
});

test('list returns empty array when directory does not exist', async t => {
	const dir = path.join(os.tmpdir(), 'nonexistent-list-test-' + Date.now().toString());
	const store = createFileThreadStore(dir);
	const ids = await store.list();
	t.deepEqual(ids, []);
});

// =============================================================================
// delete
// =============================================================================

test('delete removes a thread', async t => {
	const dir = makeTempDir();
	t.teardown(() => {
		cleanupDir(dir);
	});

	const store = createFileThreadStore(dir);
	await store.save('thread-1', createThread([userInputEvent]));

	await store.delete('thread-1');
	const loaded = await store.load('thread-1');
	t.is(loaded, undefined);

	const ids = await store.list();
	t.deepEqual(ids, []);
});

test('delete is a no-op for non-existent thread', async t => {
	const dir = makeTempDir();
	t.teardown(() => {
		cleanupDir(dir);
	});

	const store = createFileThreadStore(dir);
	await t.notThrowsAsync(async () => store.delete('does-not-exist'));
});

// =============================================================================
// default directory
// =============================================================================

test('createFileThreadStore uses default directory when none provided', async t => {
	const store = createFileThreadStore();
	// Verify load works without errors (uses ~/.ruska/threads/)
	const result = await store.load('nonexistent-default-test');
	t.is(result, undefined);
});

// =============================================================================
// loaded thread supports further operations
// =============================================================================

test('loaded thread supports append and serialize', async t => {
	const dir = makeTempDir();
	t.teardown(() => {
		cleanupDir(dir);
	});

	const store = createFileThreadStore(dir);
	const thread = createThread([userInputEvent]);
	await store.save('thread-1', thread);

	const loaded = await store.load('thread-1');
	t.not(loaded, undefined);

	loaded!.append(modelResponseEvent);
	t.is(loaded!.length, 2);

	// Save the updated thread back
	await store.save('thread-1', loaded!);
	const reloaded = await store.load('thread-1');
	t.not(reloaded, undefined);
	t.is(reloaded!.length, 2);
	t.deepEqual(reloaded!.events(), [userInputEvent, modelResponseEvent]);
});
