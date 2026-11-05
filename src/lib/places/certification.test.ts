import { describe, expect, it } from 'vitest';
import { certificationOrigin, certificationRemoved } from './certification.ts';

const base = {
	level: 'certified' as const,
	certOrigin: 'picked' as const,
	certifiedOn: '2026-10-01',
	contributors: 12,
	removedOn: null
};

describe('certificationOrigin', () => {
	it('shows the month of a pick in the page language', () => {
		expect(certificationOrigin(base, 'en')).toBe('Picked by our team · Oct\u00a02026');
		expect(certificationOrigin(base, 'es')).toBe('Elegido por nuestro equipo · oct\u00a02026');
		expect(certificationOrigin(base, 'ca')).toBe(
			'Triat pel nostre equip · oct.\u00a0del\u00a02026'
		);
	});

	it('shows the users of an automatic certification', () => {
		const confirmed = { ...base, certOrigin: 'confirmed' as const };
		expect(certificationOrigin(confirmed, 'en')).toBe('Confirmed by 12 users');
		expect(certificationOrigin(confirmed, 'es')).toBe('Confirmado por 12 usuarios');
		expect(certificationOrigin({ ...confirmed, contributors: 1 }, 'en')).toBe(
			'Confirmed by 1 user'
		);
	});

	it('shows nothing for places not certified', () => {
		expect(certificationOrigin({ ...base, level: 'community' }, 'en')).toBeUndefined();
	});
});

describe('certificationRemoved', () => {
	const removed = { ...base, level: 'community' as const, removedOn: '2026-10-01' };

	it('shows the month of the removal in the page language', () => {
		expect(certificationRemoved(removed, 'en')).toBe('Certification removed in Oct\u00a02026');
		expect(certificationRemoved(removed, 'es')).toBe('Certificación retirada en oct\u00a02026');
		// Also after an unpick that left the place without contributions.
		expect(certificationRemoved({ ...removed, level: 'osm_only' }, 'ca')).toBe(
			'Certificació retirada · oct.\u00a0del\u00a02026'
		);
	});

	it('shows nothing once the notice is over or the place is certified again', () => {
		expect(certificationRemoved({ ...removed, removedOn: null }, 'en')).toBeUndefined();
		expect(certificationRemoved({ ...removed, level: 'certified' }, 'en')).toBeUndefined();
	});
});
