/**
 * Sizes for the two versions of a photo, and the steps that get there without ever drawing a
 * canvas above what Safari allows. Pure.
 */

export type Size = { width: number; height: number };

/**
 * Safari refuses canvases above 16,777,216 pixels (4096 × 4096): a 48 MP photo is three times
 * that. No canvas of ours goes above it.
 */
export const CANVAS_MAX_PIXELS = 16_777_216;

/** WebP qualities tried in order until the file is under its size target. */
export const LARGE_QUALITIES = [0.8, 0.72, 0.64, 0.56, 0.48] as const;
export const THUMB_QUALITIES = [0.75, 0.65, 0.55, 0.45] as const;

/** The size with its long side at most `edge`, never enlarged, at least 1 × 1. */
export function fitWithin({ width, height }: Size, edge: number): Size {
	const scale = Math.min(1, edge / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

/**
 * The canvases to draw, from the source down to the target: halving at a time (sharper than
 * one big jump), starting from the first size under the pixel limit, ending with the target.
 * A small source gives just the target.
 */
export function reductionSteps(source: Size, target: Size, maxPixels = CANVAS_MAX_PIXELS): Size[] {
	const steps: Size[] = [];
	let { width, height } = source;
	while (width / 2 > target.width && height / 2 > target.height) {
		width = Math.round(width / 2);
		height = Math.round(height / 2);
		if (width * height <= maxPixels) steps.push({ width, height });
	}
	steps.push(target);
	return steps;
}
