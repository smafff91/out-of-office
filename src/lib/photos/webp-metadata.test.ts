import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isWebp, stripWebpMetadata, webpChunks } from './webp-metadata.ts';

// A 1 × 1 WebP with an EXIF chunk holding a GPS position (41°23'12.34"N 2°10'34.56"E) and an
// XMP chunk with the same position, as a phone or an editor could write them.
const withGps = new Uint8Array(readFileSync(new URL('./fixtures/gps.webp', import.meta.url)));

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
/** GPSLatitude as stored in the EXIF chunk: 41/1, 23/1, 1234/100 as little-endian rationals. */
const LATITUDE = new Uint8Array(new Uint32Array([41, 1, 23, 1, 1234, 100]).buffer);

function contains(haystack: Uint8Array, needle: Uint8Array) {
	outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
		return true;
	}
	return false;
}

describe('stripWebpMetadata', () => {
	it('the test file really carries a GPS position', () => {
		expect(webpChunks(withGps)).toEqual(['VP8X', 'VP8L', 'EXIF', 'XMP ']);
		expect(contains(withGps, LATITUDE)).toBe(true);
		expect(text(withGps)).toContain('GPSLatitude');
	});

	it('removes EXIF and XMP, GPS position included', () => {
		const clean = stripWebpMetadata(withGps);
		expect(webpChunks(clean)).toEqual(['VP8X', 'VP8L']);
		expect(contains(clean, LATITUDE)).toBe(false);
		expect(text(clean)).not.toContain('GPS');
		expect(text(clean)).not.toContain('II*');
	});

	it('clears the metadata flags and fixes the RIFF size', () => {
		const clean = stripWebpMetadata(withGps);
		expect(clean[12 + 8] & (0x20 | 0x08 | 0x04)).toBe(0);
		expect(new DataView(clean.buffer).getUint32(4, true)).toBe(clean.length - 8);
		expect(isWebp(clean)).toBe(true);
	});

	it('keeps the image bytes as they were', () => {
		const clean = stripWebpMetadata(withGps);
		const image = (bytes: Uint8Array) => {
			const at = text(bytes).indexOf('VP8L');
			const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(at + 4, true);
			return Array.from(bytes.subarray(at, at + 8 + size));
		};
		expect(image(clean)).toEqual(image(withGps));
	});

	it('leaves a clean file unchanged', () => {
		const clean = stripWebpMetadata(withGps);
		expect(Array.from(stripWebpMetadata(clean))).toEqual(Array.from(clean));
	});

	it('refuses what is not a WebP file', () => {
		expect(() => stripWebpMetadata(new TextEncoder().encode('\xff\xd8\xff\xe1 a JPEG'))).toThrow();
		expect(isWebp(new Uint8Array(4))).toBe(false);
	});

	it('refuses a truncated chunk', () => {
		expect(() => stripWebpMetadata(withGps.subarray(0, withGps.length - 20))).toThrow();
	});
});
