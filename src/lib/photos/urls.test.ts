import { describe, expect, it } from 'vitest';
import { isPhotoPath, photoUrl } from './urls.ts';

const PATH = '0b6c2f8e-4a1d-4c3b-9e2f-1a2b3c4d5e6f.webp';
const BASE = 'https://abc.supabase.co';

describe('photoUrl', () => {
	it('points at the public bucket of each version', () => {
		expect(photoUrl(BASE, 'large', PATH)).toBe(
			`${BASE}/storage/v1/object/public/place-photos/${PATH}`
		);
		expect(photoUrl(`${BASE}/`, 'thumb', PATH)).toBe(
			`${BASE}/storage/v1/object/public/place-photo-thumbs/${PATH}`
		);
	});

	it('accepts only the names the database gives out', () => {
		expect(isPhotoPath(PATH)).toBe(true);
		for (const path of [
			'../secret.webp',
			`user/${PATH}`,
			PATH.replace('.webp', '.png'),
			PATH.toUpperCase(),
			'',
			null
		]) {
			expect(isPhotoPath(path)).toBe(false);
		}
		expect(photoUrl(BASE, 'large', 'x/../../y.webp')).toBeUndefined();
	});
});
