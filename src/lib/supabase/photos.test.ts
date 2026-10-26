import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/public', () => ({ PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' }));

const { isAlreadyUploaded, newUploads, photoErrorKind, uploadPhotos } = await import('./photos.ts');

const photo = (id: string) => ({
	id,
	large: new Blob(['large'], { type: 'image/webp' }),
	thumb: new Blob(['thumb'], { type: 'image/webp' }),
	width: 1200,
	height: 900
});

/** A fake client: each step can be told to fail a number of times. */
function client(
	fail: { reserve?: string[]; large?: number; thumb?: number; publish?: number } = {}
) {
	const calls: string[] = [];
	const failures = { ...fail, reserve: [...(fail.reserve ?? [])] };
	let booked = 0;
	return {
		calls,
		rpc: vi.fn(async (fn: string) => {
			calls.push(fn);
			if (fn === 'reserve_photo') {
				const message = failures.reserve.shift();
				if (message) return { data: null, error: { message } };
				booked++;
				return { data: { id: `id-${booked}`, path: `path-${booked}.webp` }, error: null };
			}
			if (failures.publish) {
				failures.publish--;
				return { data: null, error: { message: 'photo_files_missing' } };
			}
			return { data: true, error: null };
		}),
		storage: {
			from: (bucket: string) => ({
				upload: vi.fn(async (path: string) => {
					const variant = bucket === 'place-photos' ? 'large' : 'thumb';
					calls.push(`${variant}:${path}`);
					if (failures[variant]) {
						failures[variant]!--;
						return { data: null, error: { message: 'Failed to fetch' } };
					}
					return { data: { path }, error: null };
				})
			})
		}
	};
}

type AnyClient = Parameters<typeof uploadPhotos>[0];

describe('uploadPhotos', () => {
	it('books, uploads both files and publishes each photo', async () => {
		const fake = client();
		const results = await uploadPhotos(
			fake as unknown as AnyClient,
			'c1',
			newUploads([photo('a')])
		);
		expect(results.map((r) => r.state)).toEqual(['done']);
		expect(fake.calls).toEqual([
			'reserve_photo',
			'large:path-1.webp',
			'thumb:path-1.webp',
			'publish_photo'
		]);
	});

	it('a retry carries on from the failed step, with the same booking', async () => {
		const fake = client({ thumb: 1 });
		const first = await uploadPhotos(fake as unknown as AnyClient, 'c1', newUploads([photo('a')]));
		expect(first[0].state).toBe('failed');
		expect(first[0].uploaded).toEqual({ large: true, thumb: false });

		fake.calls.length = 0;
		const second = await uploadPhotos(fake as unknown as AnyClient, 'c1', first);
		expect(second[0].state).toBe('done');
		expect(fake.calls).toEqual(['thumb:path-1.webp', 'publish_photo']);
	});

	it('the limits are not retried; other photos carry on', async () => {
		const fake = client({ reserve: ['photo_daily_limit'] });
		const results = await uploadPhotos(
			fake as unknown as AnyClient,
			'c1',
			newUploads([photo('a'), photo('b')])
		);
		expect(results.map((r) => r.state)).toEqual(['limit', 'done']);

		fake.calls.length = 0;
		await uploadPhotos(fake as unknown as AnyClient, 'c1', results);
		expect(fake.calls).toEqual([]);
	});

	it('a file already there counts as uploaded', async () => {
		expect(isAlreadyUploaded({ statusCode: '409', message: 'Duplicate' })).toBe(true);
		expect(isAlreadyUploaded({ message: 'The resource already exists' })).toBe(true);
		expect(isAlreadyUploaded({ message: 'Failed to fetch' })).toBe(false);
	});

	it('tells the limits from other failures', () => {
		expect(photoErrorKind({ message: 'photo_limit_contribution' })).toBe('limit');
		expect(photoErrorKind({ message: 'photo_daily_limit' })).toBe('limit');
		expect(photoErrorKind({ message: 'photo_files_missing' })).toBe('failed');
		expect(photoErrorKind(new TypeError('Load failed'))).toBe('failed');
		expect(photoErrorKind(undefined)).toBe('failed');
	});
});
