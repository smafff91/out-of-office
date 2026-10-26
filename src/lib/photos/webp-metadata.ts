/**
 * Removes every metadata chunk from a WebP file (EXIF with its GPS position, XMP, the ICC
 * profile, anything unknown) and keeps only the image itself. The canvas encoders usually write
 * none, but every photo goes through here before it is uploaded: the guarantee does not depend
 * on the browser. Pure, on bytes (RIFF container, https://developers.google.com/speed/webp/docs/riff_container).
 */

/** Chunks that make up the image; anything else is dropped. */
const IMAGE_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF']);
/** VP8X flags of the dropped chunks: ICC profile, EXIF, XMP. */
const METADATA_FLAGS = 0x20 | 0x08 | 0x04;

type Chunk = { fourcc: string; start: number; end: number };

const ascii = (bytes: Uint8Array, at: number) =>
	String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

export function isWebp(bytes: Uint8Array): boolean {
	return bytes.length >= 12 && ascii(bytes, 0) === 'RIFF' && ascii(bytes, 8) === 'WEBP';
}

function chunks(bytes: Uint8Array): Chunk[] {
	if (!isWebp(bytes)) throw new Error('not a WebP file');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = Math.min(bytes.length, 8 + view.getUint32(4, true));
	const list: Chunk[] = [];
	let at = 12;
	while (at + 8 <= end) {
		const size = view.getUint32(at + 4, true);
		const next = at + 8 + size + (size % 2);
		if (at + 8 + size > end) throw new Error('truncated WebP chunk');
		list.push({ fourcc: ascii(bytes, at), start: at, end: Math.min(next, end) });
		at = next;
	}
	return list;
}

/** The chunk names, in order (e.g. ['VP8X', 'VP8 ', 'EXIF']). */
export function webpChunks(bytes: Uint8Array): string[] {
	return chunks(bytes).map((chunk) => chunk.fourcc);
}

/** The same image without metadata. Throws if the bytes are not a WebP file. */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
	const kept = chunks(bytes).filter((chunk) => IMAGE_CHUNKS.has(chunk.fourcc));
	const length = 12 + kept.reduce((sum, chunk) => sum + chunk.end - chunk.start, 0);
	const out = new Uint8Array(length);
	out.set(bytes.subarray(0, 12));
	new DataView(out.buffer).setUint32(4, length - 8, true);
	let at = 12;
	for (const chunk of kept) {
		out.set(bytes.subarray(chunk.start, chunk.end), at);
		if (chunk.fourcc === 'VP8X') out[at + 8] &= ~METADATA_FLAGS;
		at += chunk.end - chunk.start;
	}
	return out;
}
