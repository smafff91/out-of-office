import { describe, expect, it, vi } from 'vitest';
import { drain, type DeletionQueue, type QueuedFile } from './drain.ts';
import { SECRET_HEADER, handleStorageCleanup, sameSecret } from './handler.ts';

const SECRET = 'a'.repeat(64);

/** An in-memory queue: claimed rows are not handed out again, like the database. */
function fakeQueue(files: QueuedFile[], failing = new Set<string>()) {
	const pending = [...files];
	const removed: string[] = [];
	const finished: number[] = [];
	const queue: DeletionQueue = {
		claim: vi.fn(async (limit: number) => pending.splice(0, limit)),
		finish: vi.fn(async (ids: number[]) => void finished.push(...ids)),
		remove: vi.fn(async (bucket: string, names: string[]) => {
			if (failing.has(bucket)) throw new Error('storage down');
			removed.push(...names.map((name) => `${bucket}/${name}`));
		})
	};
	return { queue, removed, finished };
}

const files = (count: number): QueuedFile[] =>
	Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		bucket_id: i % 2 ? 'place-photo-thumbs' : 'place-photos',
		name: `${Math.floor(i / 2)}.webp`
	}));

const request = (headers: Record<string, string> = {}, method = 'POST') =>
	new Request('https://fn.example/storage-cleanup', { method, headers });

describe('handleStorageCleanup', () => {
	it('refuses a call without the secret before touching the queue', async () => {
		const factory = vi.fn();
		const response = await handleStorageCleanup(
			request(),
			{ STORAGE_CLEANUP_SECRET: SECRET },
			factory
		);
		expect(response.status).toBe(401);
		expect(factory).not.toHaveBeenCalled();
	});

	it('refuses a wrong secret', async () => {
		const factory = vi.fn();
		const response = await handleStorageCleanup(
			request({ [SECRET_HEADER]: 'b'.repeat(64) }),
			{ STORAGE_CLEANUP_SECRET: SECRET },
			factory
		);
		expect(response.status).toBe(401);
		expect(factory).not.toHaveBeenCalled();
	});

	it('refuses everything when the function has no secret', async () => {
		const factory = vi.fn();
		const response = await handleStorageCleanup(request({ [SECRET_HEADER]: '' }), {}, factory);
		expect(response.status).toBe(401);
		expect(factory).not.toHaveBeenCalled();
	});

	it('accepts only POST', async () => {
		const factory = vi.fn();
		const response = await handleStorageCleanup(
			request({ [SECRET_HEADER]: SECRET }, 'GET'),
			{ STORAGE_CLEANUP_SECRET: SECRET },
			factory
		);
		expect(response.status).toBe(405);
		expect(factory).not.toHaveBeenCalled();
	});

	it('drains the queue with the right secret and logs only counts', async () => {
		const { queue, removed, finished } = fakeQueue(files(4));
		const log = vi.fn();
		const response = await handleStorageCleanup(
			request({ [SECRET_HEADER]: SECRET }),
			{ STORAGE_CLEANUP_SECRET: SECRET },
			() => queue,
			log
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ removed: 4, failed: 0 });
		expect(removed.sort()).toEqual([
			'place-photo-thumbs/0.webp',
			'place-photo-thumbs/1.webp',
			'place-photos/0.webp',
			'place-photos/1.webp'
		]);
		expect(finished.sort()).toEqual([1, 2, 3, 4]);
		expect(log.mock.calls.flat().join(' ')).not.toContain('.webp');
		expect(log.mock.calls.flat().join(' ')).not.toContain(SECRET);
	});
});

describe('drain', () => {
	it('works through several batches', async () => {
		const { queue, finished } = fakeQueue(files(25));
		expect(await drain(queue, { batch: 10 })).toEqual({ removed: 25, failed: 0 });
		expect(finished).toHaveLength(25);
	});

	it('leaves the files of a failing bucket in the queue and carries on', async () => {
		const { queue, finished } = fakeQueue(files(4), new Set(['place-photo-thumbs']));
		expect(await drain(queue)).toEqual({ removed: 2, failed: 2 });
		expect(finished.sort()).toEqual([1, 3]);
	});

	it('stops after maxBatches', async () => {
		const { queue } = fakeQueue(files(50));
		expect(await drain(queue, { batch: 10, maxBatches: 2 })).toEqual({ removed: 20, failed: 0 });
	});
});

describe('sameSecret', () => {
	it('compares the whole value', () => {
		expect(sameSecret(SECRET, SECRET)).toBe(true);
		expect(sameSecret(SECRET.slice(0, -1), SECRET)).toBe(false);
		expect(sameSecret(SECRET + 'a', SECRET)).toBe(false);
		expect(sameSecret('', SECRET)).toBe(false);
	});
});
