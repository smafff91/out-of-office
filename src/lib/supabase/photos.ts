/**
 * Uploading the photos of a contribution, after submit_contribution
 * (supabase/migrations/20261029120000_photos.sql and 20261029130000_photo_storage.sql):
 *   reserve_photo  → a random name, the limits checked (3 per update, 15 per day);
 *   upload         → the two files to that name, in their two buckets;
 *   publish_photo  → public once both files are there.
 * Each photo remembers how far it got, so "Try again" carries on from the step that failed
 * (same booking: nothing is counted twice). A failure never touches the contribution.
 */
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import { TERMS_VERSION } from '#lib/config.ts';
import type { CompressedPhoto } from '#lib/photos/compress.ts';
import { PHOTO_BUCKETS, photoUrl, type PhotoVariant } from '#lib/photos/urls.ts';
import type { createSupabaseClient } from './client.ts';

type Client = ReturnType<typeof createSupabaseClient>;

export type PhotoUpload = {
	photo: CompressedPhoto;
	/** The booking, once reserve_photo answered. */
	path?: string;
	photoId?: string;
	uploaded: { large: boolean; thumb: boolean };
	/** done: public; limit: refused by the daily or per-update limit (no retry); failed: retry. */
	state: 'pending' | 'done' | 'limit' | 'failed';
};

export function newUploads(photos: CompressedPhoto[]): PhotoUpload[] {
	return photos.map((photo) => ({
		photo,
		uploaded: { large: false, thumb: false },
		state: 'pending'
	}));
}

const LIMIT_ERRORS = new Set(['photo_daily_limit', 'photo_limit_contribution']);

type ErrorLike = { message?: string; statusCode?: string | number; status?: number };

/** A refusal because of the limits (no point trying again), or anything else. */
export function photoErrorKind(error: unknown): 'limit' | 'failed' {
	const { message = '' } = (error ?? {}) as ErrorLike;
	return LIMIT_ERRORS.has(message) ? 'limit' : 'failed';
}

/** The file is already there: only its owner can write a booked name, so it is ours. */
export function isAlreadyUploaded(error: unknown): boolean {
	const { message = '', statusCode, status } = (error ?? {}) as ErrorLike;
	return (
		String(statusCode) === '409' || status === 409 || /already exists|duplicate/i.test(message)
	);
}

async function uploadOne(
	supabase: Client,
	contributionId: string,
	upload: PhotoUpload
): Promise<PhotoUpload> {
	let { path, photoId } = upload;
	const uploaded = { ...upload.uploaded };
	try {
		if (!path || !photoId) {
			const { data, error } = await supabase.rpc('reserve_photo', {
				p_contribution_id: contributionId,
				p_width: upload.photo.width,
				p_height: upload.photo.height,
				p_terms_version: TERMS_VERSION
			});
			if (error) throw error;
			const booking = data as { id?: string; path?: string };
			if (!booking.id || !booking.path) throw new Error('reserve_photo: no booking');
			photoId = booking.id;
			path = booking.path;
		}
		for (const variant of ['large', 'thumb'] as const) {
			if (uploaded[variant]) continue;
			const { error } = await supabase.storage
				.from(PHOTO_BUCKETS[variant])
				.upload(path, upload.photo[variant], {
					contentType: 'image/webp',
					// One hour: on the Free plan the CDN keeps serving a cached file until it expires,
					// even after it is deleted (account deletion, moderation).
					cacheControl: '3600',
					upsert: false
				});
			if (error && !isAlreadyUploaded(error)) throw error;
			uploaded[variant] = true;
		}
		const { error } = await supabase.rpc('publish_photo', { p_photo_id: photoId });
		if (error) throw error;
		return { ...upload, path, photoId, uploaded, state: 'done' };
	} catch (error) {
		return { ...upload, path, photoId, uploaded, state: photoErrorKind(error) };
	}
}

/** Uploads what is not done yet, one photo after the other. Never throws. */
export async function uploadPhotos(
	supabase: Client,
	contributionId: string,
	uploads: PhotoUpload[]
): Promise<PhotoUpload[]> {
	const results: PhotoUpload[] = [];
	for (const upload of uploads) {
		if (upload.state === 'done' || upload.state === 'limit') {
			results.push(upload);
			continue;
		}
		results.push(await uploadOne(supabase, contributionId, upload));
	}
	return results;
}

export function publicPhotoUrl(variant: PhotoVariant, path: string): string | undefined {
	return photoUrl(PUBLIC_SUPABASE_URL, variant, path);
}
