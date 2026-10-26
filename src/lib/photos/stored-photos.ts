/**
 * The compressed photos of a contribution draft, kept in the browser (IndexedDB) from the moment
 * they are chosen: they survive the Google sign-in and the language reload, like the rest of the
 * draft (sessionStorage, handoff.ts), which only keeps their ids. Too big for sessionStorage,
 * and IndexedDB cannot be written in the instant before leaving, hence on choosing.
 * Kept as long as the draft (DRAFT_MAX_AGE_MS), one entry per place. Every access is wrapped:
 * without IndexedDB (private mode, blocked storage) the photos simply live in memory and the
 * form asks to add them again after a reload.
 */
import { DRAFT_MAX_AGE_MS } from '#lib/contribute/draft.ts';
import type { CompressedPhoto } from './compress.ts';

const DB_NAME = 'out-of-office';
const STORE = 'draft-photos';

/** ArrayBuffers rather than Blobs: older Safari versions lose Blobs stored in IndexedDB. */
type StoredPhoto = {
	id: string;
	large: ArrayBuffer;
	thumb: ArrayBuffer;
	width: number;
	height: number;
};
type Entry = { placeId: string; savedAt: number; photos: StoredPhoto[] };

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
	opening ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE, { keyPath: 'placeId' });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('blocked'));
	}).catch((error) => {
		opening = undefined;
		throw error;
	});
	return opening;
}

async function run<T>(
	mode: IDBTransactionMode,
	action: (store: IDBObjectStore) => IDBRequest | void
): Promise<T | undefined> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE, mode);
		const request = action(transaction.objectStore(STORE));
		transaction.oncomplete = () => resolve(request ? (request.result as T) : undefined);
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

/** Saves the photos of a draft (replacing what was there). False if the browser cannot keep them. */
export async function savePhotos(placeId: string, photos: CompressedPhoto[]): Promise<boolean> {
	try {
		if (photos.length === 0) {
			await clearPhotos(placeId);
			return true;
		}
		const stored: StoredPhoto[] = await Promise.all(
			photos.map(async (photo) => ({
				id: photo.id,
				large: await photo.large.arrayBuffer(),
				thumb: await photo.thumb.arrayBuffer(),
				width: photo.width,
				height: photo.height
			}))
		);
		const entry: Entry = { placeId, savedAt: Date.now(), photos: stored };
		await run('readwrite', (store) => store.put(entry));
		return true;
	} catch {
		return false;
	}
}

/** The photos saved for this place, if any and not older than a draft. */
export async function loadPhotos(placeId: string): Promise<CompressedPhoto[]> {
	try {
		const entry = await run<Entry>('readonly', (store) => store.get(placeId));
		if (!entry || Date.now() - entry.savedAt > DRAFT_MAX_AGE_MS) return [];
		return entry.photos.map((photo) => ({
			id: photo.id,
			large: new Blob([photo.large], { type: 'image/webp' }),
			thumb: new Blob([photo.thumb], { type: 'image/webp' }),
			width: photo.width,
			height: photo.height
		}));
	} catch {
		return [];
	}
}

export async function clearPhotos(placeId: string): Promise<void> {
	try {
		await run('readwrite', (store) => store.delete(placeId));
	} catch {
		// Nothing kept, or nothing to do.
	}
}

/** Drops the photos of drafts that can no longer come back (any place). */
export async function pruneStoredPhotos(now = Date.now()): Promise<void> {
	try {
		const entries = (await run<Entry[]>('readonly', (store) => store.getAll())) ?? [];
		const stale = entries.filter((entry) => now - entry.savedAt > DRAFT_MAX_AGE_MS);
		if (stale.length === 0) return;
		await run('readwrite', (store) => {
			for (const entry of stale) store.delete(entry.placeId);
		});
	} catch {
		// Nothing kept, or nothing to do.
	}
}
