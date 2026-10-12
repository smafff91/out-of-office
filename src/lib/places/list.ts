/**
 * Order of the list, computed in the browser from the map pins (the user's position never
 * leaves the device). Top rated uses the database ranking (Wilson lower bound).
 */
import type { LngLat, PlaceCollection, PlaceLevel } from '#lib/map/index.ts';
import type { RankedPlace } from '#lib/supabase/places.ts';
import { distanceMeters } from './distance.ts';

/** Where "Nearest" starts from. Distances are shown only for the user's real position. */
export type Origin = { point: LngLat; kind: 'user' | 'area' | 'center' | 'map' };
export type Sort = 'nearest' | 'top';

export type ListEntry = {
	slug: string;
	name: string;
	level: PlaceLevel;
	point: LngLat;
	distance: number;
};
export type SectionId = 'all' | 'rated' | 'few_votes' | 'no_votes';
export type Section = { id: SectionId; entries: ListEntry[] };

type Options = {
	origin: Origin;
	sort: Sort;
	certifiedOnly: boolean;
	/** Needed for Top rated; undefined while it loads. */
	ranking?: RankedPlace[];
};

export function buildSections(places: PlaceCollection, options: Options): Section[] | undefined {
	const entries = places.features
		.filter((feature) => !options.certifiedOnly || feature.properties.level === 'certified')
		.map((feature) => ({
			slug: feature.properties.slug,
			name: feature.properties.name,
			level: feature.properties.level,
			point: feature.geometry.coordinates,
			distance: distanceMeters(options.origin.point, feature.geometry.coordinates)
		}));
	const byDistance = (a: ListEntry, b: ListEntry) => a.distance - b.distance;

	if (options.sort === 'nearest') return [{ id: 'all', entries: entries.toSorted(byDistance) }];
	if (!options.ranking) return undefined;

	const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
	const ranked = (section: RankedPlace['section']) =>
		options
			.ranking!.filter((place) => place.section === section)
			.map((place) => bySlug.get(place.slug))
			.filter((entry): entry is ListEntry => entry !== undefined);
	const votedSlugs = new Set(options.ranking.map((place) => place.slug));
	return [
		{ id: 'rated', entries: ranked('rated') },
		{ id: 'few_votes', entries: ranked('few_votes') },
		{
			id: 'no_votes',
			entries: entries.filter((entry) => !votedSlugs.has(entry.slug)).toSorted(byDistance)
		}
	];
}

/** The first `count` entries across sections, keeping the section of each one. */
export function firstEntries(sections: Section[], count: number): Section[] {
	const result: Section[] = [];
	let left = count;
	for (const section of sections) {
		if (left <= 0) break;
		if (!section.entries.length) continue;
		result.push({ id: section.id, entries: section.entries.slice(0, left) });
		left -= section.entries.length;
	}
	return result;
}

export const totalEntries = (sections: Section[]) =>
	sections.reduce((sum, section) => sum + section.entries.length, 0);
