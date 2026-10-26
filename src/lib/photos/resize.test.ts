import { describe, expect, it } from 'vitest';
import { CANVAS_MAX_PIXELS, fitWithin, reductionSteps } from './resize.ts';

describe('fitWithin', () => {
	it('brings the long side to the edge, keeping the shape', () => {
		expect(fitWithin({ width: 4032, height: 3024 }, 1200)).toEqual({ width: 1200, height: 900 });
		expect(fitWithin({ width: 3024, height: 4032 }, 1200)).toEqual({ width: 900, height: 1200 });
		expect(fitWithin({ width: 1200, height: 900 }, 400)).toEqual({ width: 400, height: 300 });
	});

	it('never enlarges', () => {
		expect(fitWithin({ width: 800, height: 600 }, 1200)).toEqual({ width: 800, height: 600 });
	});

	it('keeps at least one pixel for very thin images', () => {
		expect(fitWithin({ width: 10_000, height: 3 }, 400)).toEqual({ width: 400, height: 1 });
	});
});

describe('reductionSteps', () => {
	it('48 MP: every canvas under the Safari limit, ending at the target', () => {
		const source = { width: 8064, height: 6048 };
		const target = fitWithin(source, 1200);
		const steps = reductionSteps(source, target);
		expect(steps.at(-1)).toEqual(target);
		for (const step of steps)
			expect(step.width * step.height).toBeLessThanOrEqual(CANVAS_MAX_PIXELS);
		expect(steps[0]).toEqual({ width: 4032, height: 3024 });
	});

	it('8000 × 6000', () => {
		const steps = reductionSteps({ width: 8000, height: 6000 }, { width: 1200, height: 900 });
		expect(steps).toEqual([
			{ width: 4000, height: 3000 },
			{ width: 2000, height: 1500 },
			{ width: 1200, height: 900 }
		]);
	});

	it('a small photo goes straight to the target', () => {
		expect(reductionSteps({ width: 1600, height: 1200 }, { width: 1200, height: 900 })).toEqual([
			{ width: 1200, height: 900 }
		]);
	});

	it('skips halvings still above the limit', () => {
		const steps = reductionSteps({ width: 20_000, height: 15_000 }, { width: 1200, height: 900 });
		// 10000 × 7500 and 5000 × 3750 are both above 16.7 MP.
		expect(steps[0]).toEqual({ width: 2500, height: 1875 });
	});
});
