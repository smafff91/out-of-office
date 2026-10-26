/**
 * Public addresses of a photo's two files. The buckets are public and the names random
 * (<photo id>.webp, supabase/migrations/20261029130000_photo_storage.sql): no request needed.
 */

export const PHOTO_BUCKETS = { large: 'place-photos', thumb: 'place-photo-thumbs' } as const;
export type PhotoVariant = keyof typeof PHOTO_BUCKETS;

/** The only names the database gives out. Anything else is not a photo of ours. */
const PHOTO_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function isPhotoPath(path: unknown): path is string {
	return typeof path === 'string' && PHOTO_PATH.test(path);
}

/** @param base the Supabase project URL (PUBLIC_SUPABASE_URL) */
export function photoUrl(base: string, variant: PhotoVariant, path: string): string | undefined {
	if (!isPhotoPath(path)) return undefined;
	return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${PHOTO_BUCKETS[variant]}/${path}`;
}
