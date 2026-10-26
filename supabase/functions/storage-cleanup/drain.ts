/**
 * Empties the file deletion queue (public.storage_deletions, filled by a trigger every time a
 * photo row is deleted): claims a batch, removes the files through the Storage API, marks them
 * done. Files that fail stay claimed and are taken again by a later run (after 5 minutes).
 * Used by the storage-cleanup Edge Function and by `npm run photos -- --remove`.
 * No Deno or Node APIs here.
 */

export type QueuedFile = { id: number; bucket_id: string; name: string };

export type DeletionQueue = {
	claim(limit: number): Promise<QueuedFile[]>;
	finish(ids: number[]): Promise<void>;
	/** Removes files of one bucket; files already gone are not an error. Throws on failure. */
	remove(bucket: string, names: string[]): Promise<void>;
};

/** The parts of a supabase-js client (service role) the queue needs. */
type ServiceClient = {
	rpc(
		fn: string,
		args: Record<string, unknown>
	): PromiseLike<{ data: unknown; error: { message: string } | null }>;
	storage: {
		from(bucket: string): {
			remove(names: string[]): Promise<{ error: { message: string } | null }>;
		};
	};
};

export function supabaseQueue(client: ServiceClient): DeletionQueue {
	return {
		async claim(limit) {
			const { data, error } = await client.rpc('claim_storage_deletions', { p_limit: limit });
			if (error) throw new Error(`claim_storage_deletions: ${error.message}`);
			return (data ?? []) as QueuedFile[];
		},
		async finish(ids) {
			if (ids.length === 0) return;
			const { error } = await client.rpc('finish_storage_deletions', { p_ids: ids });
			if (error) throw new Error(`finish_storage_deletions: ${error.message}`);
		},
		async remove(bucket, names) {
			const { error } = await client.storage.from(bucket).remove(names);
			if (error) throw new Error(`remove from ${bucket}: ${error.message}`);
		}
	};
}

export async function drain(
	queue: DeletionQueue,
	{ batch = 100, maxBatches = 20 }: { batch?: number; maxBatches?: number } = {}
): Promise<{ removed: number; failed: number }> {
	let removed = 0;
	let failed = 0;
	for (let round = 0; round < maxBatches; round++) {
		const files = await queue.claim(batch);
		if (files.length === 0) break;
		const byBucket = new Map<string, QueuedFile[]>();
		for (const file of files) {
			byBucket.set(file.bucket_id, [...(byBucket.get(file.bucket_id) ?? []), file]);
		}
		const done: number[] = [];
		for (const [bucket, group] of byBucket) {
			try {
				await queue.remove(
					bucket,
					group.map((file) => file.name)
				);
				done.push(...group.map((file) => file.id));
			} catch {
				failed += group.length;
			}
		}
		await queue.finish(done);
		removed += done.length;
	}
	return { removed, failed };
}
