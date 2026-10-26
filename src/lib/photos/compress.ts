/**
 * Turns a chosen photo into the two WebP files that are uploaded (browser only):
 * - large: long side 1200 px, under PHOTO_LARGE.maxBytes; thumb: 400 px, under PHOTO_THUMB.maxBytes;
 * - the right way up (EXIF orientation applied), and without any metadata: the canvas drops
 *   EXIF and GPS, and stripWebpMetadata() removes whatever an encoder might add;
 * - never a canvas above CANVAS_MAX_PIXELS (Safari's limit): the browser decodes straight at
 *   1200 px when it can, otherwise the image is halved step by step (resize.ts);
 * - HEIC that the browser cannot open: decoded by heic-to (LGPL-3.0, libheif), loaded only then;
 * - a browser whose canvas cannot write WebP (Safari): encoded by @jsquash/webp (Apache-2.0,
 *   libwebp), loaded as soon as "Add photo" is tapped (prepareEncoder).
 */
import { PHOTO_LARGE, PHOTO_THUMB } from '#lib/config.ts';
import {
	LARGE_QUALITIES,
	THUMB_QUALITIES,
	fitWithin,
	reductionSteps,
	type Size
} from './resize.ts';
import { stripWebpMetadata } from './webp-metadata.ts';

export type CompressedPhoto = {
	/** Local id, for the draft and the browser storage (not the photo id in the database). */
	id: string;
	large: Blob;
	thumb: Blob;
	/** Size of the large version. */
	width: number;
	height: number;
};

/** The file is not an image the browser (or heic-to) can open. */
export class UnreadablePhotoError extends Error {
	constructor() {
		super('unreadable_photo');
	}
}

type WebpEncoder = (data: ImageData, options: { quality: number }) => Promise<ArrayBuffer>;

let webpSupport: Promise<boolean> | undefined;
let fallbackEncoder: Promise<WebpEncoder> | undefined;

/** Whether this browser's canvas writes WebP (Safari writes PNG instead). Checked once. */
export function canvasEncodesWebp(): Promise<boolean> {
	webpSupport ??= new Promise((resolve) => {
		try {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			canvas.toBlob((blob) => resolve(blob?.type === 'image/webp'), 'image/webp', 0.8);
		} catch {
			resolve(false);
		}
	});
	return webpSupport;
}

function loadFallbackEncoder(): Promise<WebpEncoder> {
	fallbackEncoder ??= import('@jsquash/webp/encode')
		.then(async (module) => {
			await module.init();
			return module.default as WebpEncoder;
		})
		.catch((error) => {
			// A failed download (offline) can be tried again with the next photo.
			fallbackEncoder = undefined;
			throw error;
		});
	return fallbackEncoder;
}

/** Called on "Add photo": the check, and the encoder download if needed, start before the file arrives. */
export function prepareEncoder() {
	void canvasEncodesWebp().then((ok) => {
		if (!ok) loadFallbackEncoder().catch(() => {});
	});
}

function canvas({ width, height }: Size) {
	const element = document.createElement('canvas');
	element.width = width;
	element.height = height;
	return element;
}

function context(element: HTMLCanvasElement) {
	const ctx = element.getContext('2d');
	if (!ctx) throw new Error('canvas_unavailable');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	return ctx;
}

/** Frees a canvas at once (Safari also counts the total memory of live canvases). */
function release(element: HTMLCanvasElement) {
	element.width = element.height = 0;
}

/** An <img> of the file: its size is known without decoding the pixels yet. */
function loadImage(file: Blob): Promise<{ image: HTMLImageElement; done: () => void }> {
	const url = URL.createObjectURL(file);
	const image = new Image();
	image.decoding = 'async';
	return new Promise((resolve, reject) => {
		image.onload = () => resolve({ image, done: () => URL.revokeObjectURL(url) });
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new UnreadablePhotoError());
		};
		image.src = url;
	});
}

/** Draws `source` down to `target` through canvases that all stay under the pixel limit. */
function drawDown(source: CanvasImageSource, size: Size, target: Size): HTMLCanvasElement {
	let current: CanvasImageSource = source;
	let previous: HTMLCanvasElement | undefined;
	for (const step of reductionSteps(size, target)) {
		const next = canvas(step);
		context(next).drawImage(current, 0, 0, step.width, step.height);
		if (previous) release(previous);
		previous = next;
		current = next;
	}
	return previous!;
}

/** The large version as a canvas, the right way up. */
async function drawLarge(file: Blob): Promise<HTMLCanvasElement> {
	let loaded: { image: HTMLImageElement; done: () => void } | undefined;
	try {
		loaded = await loadImage(file);
	} catch {
		return drawHeic(file);
	}
	const { image, done } = loaded;
	try {
		const size = { width: image.naturalWidth, height: image.naturalHeight };
		if (!size.width || !size.height) throw new UnreadablePhotoError();
		const target = fitWithin(size, PHOTO_LARGE.edge);
		// Decoded straight at the target size where the browser supports it (no full-size pixels).
		const bitmap = await createImageBitmap(file, {
			imageOrientation: 'from-image',
			resizeWidth: target.width,
			resizeHeight: target.height,
			resizeQuality: 'high'
		}).catch(() => undefined);
		if (bitmap) {
			try {
				if (bitmap.width === target.width && bitmap.height === target.height) {
					return drawDown(bitmap, target, target);
				}
				// Resize options ignored: the bitmap is full size. Usable if it is the right way up.
				if (bitmap.width === size.width && bitmap.height === size.height) {
					return drawDown(bitmap, size, target);
				}
			} finally {
				bitmap.close();
			}
		}
		// The <img> applies the orientation in every current browser.
		return drawDown(image, size, target);
	} finally {
		done();
	}
}

async function drawHeic(file: Blob): Promise<HTMLCanvasElement> {
	let bitmap: ImageBitmap;
	try {
		const { heicTo, isHeic } = await import('heic-to');
		if (!(await isHeic(file as File))) throw new UnreadablePhotoError();
		bitmap = await heicTo({
			blob: file,
			type: 'bitmap',
			options: { imageOrientation: 'from-image' }
		});
	} catch {
		throw new UnreadablePhotoError();
	}
	try {
		const size = { width: bitmap.width, height: bitmap.height };
		return drawDown(bitmap, size, fitWithin(size, PHOTO_LARGE.edge));
	} finally {
		bitmap.close();
	}
}

function toBlob(element: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => element.toBlob(resolve, 'image/webp', quality));
}

async function encodeOnce(element: HTMLCanvasElement, quality: number): Promise<Blob> {
	let bytes: Uint8Array | undefined;
	if (await canvasEncodesWebp()) {
		const blob = await toBlob(element, quality);
		if (blob?.type === 'image/webp') bytes = new Uint8Array(await blob.arrayBuffer());
	}
	if (!bytes) {
		const encode = await loadFallbackEncoder();
		const data = context(element).getImageData(0, 0, element.width, element.height);
		bytes = new Uint8Array(await encode(data, { quality: Math.round(quality * 100) }));
	}
	return new Blob([stripWebpMetadata(bytes) as Uint8Array<ArrayBuffer>], { type: 'image/webp' });
}

/** The first quality whose file is under the target size. */
async function encode(
	element: HTMLCanvasElement,
	qualities: readonly number[],
	maxBytes: number
): Promise<Blob> {
	for (const quality of qualities) {
		const blob = await encodeOnce(element, quality);
		if (blob.size <= maxBytes) return blob;
	}
	throw new Error('photo_too_large');
}

export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
	const large = await drawLarge(file);
	try {
		const size = { width: large.width, height: large.height };
		const thumbCanvas = drawDown(large, size, fitWithin(size, PHOTO_THUMB.edge));
		try {
			return {
				id: crypto.randomUUID(),
				large: await encode(large, LARGE_QUALITIES, PHOTO_LARGE.maxBytes),
				thumb: await encode(thumbCanvas, THUMB_QUALITIES, PHOTO_THUMB.maxBytes),
				width: size.width,
				height: size.height
			};
		} finally {
			release(thumbCanvas);
		}
	} finally {
		release(large);
	}
}
