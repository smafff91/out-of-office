/**
 * Pin images for the community and certified levels, drawn on a canvas from the design tokens
 * (src/lib/styles/tokens.css), so the palette lives in one place. Sizes follow LatteHome.
 * The "not checked yet" dot is a plain circle layer (see engine.ts).
 */

export const PIXEL_RATIO = 2;

/** Room around each pin for its shadow, in CSS pixels. */
const SHADOW_PAD = 8;

export type PinImage = { width: number; height: number; data: Uint8ClampedArray };

export type Palette = {
	ink: string;
	surface: string;
	pinfg: string;
	dot: string;
	dotbg: string;
	me: string;
	meHalo: string;
	shadow: string;
};

export function readPalette(): Palette {
	const style = getComputedStyle(document.documentElement);
	const token = (name: string) => style.getPropertyValue(name).trim();
	return {
		ink: token('--ink'),
		surface: token('--surface'),
		pinfg: token('--pinfg'),
		dot: token('--dot'),
		dotbg: token('--dotbg'),
		me: token('--me'),
		meHalo: token('--me-halo'),
		shadow: token('--sh-4')
	};
}

function drawPin(
	size: number,
	draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void
): PinImage {
	const full = size + SHADOW_PAD * 2;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = full * PIXEL_RATIO;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D is not available');
	ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
	draw(ctx, SHADOW_PAD, SHADOW_PAD);
	return {
		width: canvas.width,
		height: canvas.height,
		data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
	};
}

function roundedSquare(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	r: number
) {
	ctx.beginPath();
	ctx.roundRect(x, y, size, size, r);
}

/** White 28px square, 2.5px espresso border, 8px espresso dot. */
export function communityPin(palette: Palette): PinImage {
	const size = 28;
	return drawPin(size, (ctx, x, y) => {
		ctx.shadowColor = palette.shadow;
		ctx.shadowBlur = 6;
		ctx.shadowOffsetY = 2;
		roundedSquare(ctx, x, y, size, 9);
		ctx.fillStyle = palette.surface;
		ctx.fill();
		ctx.shadowColor = 'transparent';

		const border = 2.5;
		roundedSquare(ctx, x + border / 2, y + border / 2, size - border, 9 - border / 2);
		ctx.lineWidth = border;
		ctx.strokeStyle = palette.ink;
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(x + size / 2, y + size / 2, 4, 0, Math.PI * 2);
		ctx.fillStyle = palette.ink;
		ctx.fill();
	});
}

/** Espresso 34px square with a crema check. */
export function certifiedPin(palette: Palette): PinImage {
	const size = 34;
	return drawPin(size, (ctx, x, y) => {
		ctx.shadowColor = palette.shadow;
		ctx.shadowBlur = 10;
		ctx.shadowOffsetY = 3;
		roundedSquare(ctx, x, y, size, 11);
		ctx.fillStyle = palette.ink;
		ctx.fill();
		ctx.shadowColor = 'transparent';

		// The mockup's check icon: path "M5 12l5 5L20 7" in a 24px box, drawn 15px wide.
		const icon = 15;
		const scale = icon / 24;
		const ox = x + (size - icon) / 2;
		const oy = y + (size - icon) / 2;
		ctx.beginPath();
		ctx.moveTo(ox + 5 * scale, oy + 12 * scale);
		ctx.lineTo(ox + 10 * scale, oy + 17 * scale);
		ctx.lineTo(ox + 20 * scale, oy + 7 * scale);
		ctx.lineWidth = 2.6;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = palette.pinfg;
		ctx.stroke();
	});
}

/** White 14px dot with a grey rim: only used for a selected "not checked yet" place. */
export function uncheckedPin(palette: Palette): PinImage {
	const size = 14;
	return drawPin(size, (ctx, x, y) => {
		ctx.shadowColor = palette.shadow;
		ctx.shadowBlur = 6;
		ctx.shadowOffsetY = 2;
		ctx.beginPath();
		ctx.arc(x + size / 2, y + size / 2, size / 2 - 1, 0, Math.PI * 2);
		ctx.fillStyle = palette.dotbg;
		ctx.fill();
		ctx.shadowColor = 'transparent';
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = palette.dot;
		ctx.stroke();
	});
}
