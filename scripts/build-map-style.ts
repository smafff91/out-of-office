/**
 * Builds the base map style (src/lib/map/style.json) from OpenFreeMap's Positron:
 * no points of interest, no icons (so no sprite to download), Latte colors.
 *
 *   npm run map:style
 *
 * Run it only to pick up upstream changes or new colors: the result is committed, and the app
 * never reads the style from the network (only tiles and label fonts).
 */
import { writeFile } from 'node:fs/promises';

const SOURCE_URL = 'https://tiles.openfreemap.org/styles/positron';
const OUTPUT = 'src/lib/map/style.json';

/** Layers removed whole: POIs, road shields and the airport icon. */
const DROPPED_SOURCE_LAYERS = new Set(['poi', 'aerodrome_label', 'mountain_peak', 'housenumber']);
const DROPPED_LAYERS = new Set([
	'highway-shield-non-us',
	'highway-shield-us-interstate',
	'road_shield_us',
	'airport'
]);

// Latte palette (src/lib/styles/tokens.css): Map, Blocks, Street, Water, Espresso, Roast,
// plus a few in-between tones for map details only.
const MAP = '#f2ede6';
const BLOCKS = '#e6ddd2';
const STREET = '#ffffff';
const WATER = '#d9dfe0';
const INK = '#1f1712';
const MUTED = '#6b5d53';
const CASING = '#e0d5c8';
const PATH = '#ece5dc';
const GREEN = '#e4e2d4';
const RAIL = '#dcd2c6';
const BORDER = '#c9bdb0';
const WATER_TEXT = '#7d8a8e';

/** Paint colors per layer id; layers not listed keep Positron's colors. */
const COLORS: Record<string, Record<string, string>> = {
	background: { 'background-color': MAP },
	park: { 'fill-color': GREEN },
	water: { 'fill-color': WATER },
	landcover_ice_shelf: { 'fill-color': MAP },
	landcover_glacier: { 'fill-color': MAP },
	landuse_residential: { 'fill-color': MAP },
	landcover_wood: { 'fill-color': GREEN },
	waterway: { 'line-color': WATER },
	building: { 'fill-color': BLOCKS, 'fill-outline-color': CASING },
	tunnel_motorway_casing: { 'line-color': CASING },
	tunnel_motorway_inner: { 'line-color': PATH },
	'aeroway-taxiway': { 'line-color': PATH },
	'aeroway-runway-casing': { 'line-color': PATH },
	'aeroway-area': { 'fill-color': STREET },
	'aeroway-runway': { 'line-color': STREET },
	road_area_pier: { 'fill-color': MAP },
	road_pier: { 'line-color': MAP },
	highway_path: { 'line-color': PATH },
	highway_minor: { 'line-color': STREET },
	highway_major_casing: { 'line-color': CASING },
	highway_major_inner: { 'line-color': STREET },
	highway_major_subtle: { 'line-color': CASING },
	highway_motorway_casing: { 'line-color': CASING },
	highway_motorway_inner: { 'line-color': STREET },
	highway_motorway_subtle: { 'line-color': CASING },
	railway_transit: { 'line-color': RAIL },
	railway_transit_dashline: { 'line-color': MAP },
	railway_service: { 'line-color': RAIL },
	railway_service_dashline: { 'line-color': MAP },
	railway: { 'line-color': RAIL },
	railway_dashline: { 'line-color': MAP },
	highway_motorway_bridge_casing: { 'line-color': CASING },
	highway_motorway_bridge_inner: { 'line-color': STREET },
	boundary_3: { 'line-color': BORDER },
	boundary_2: { 'line-color': BORDER },
	boundary_disputed: { 'line-color': BORDER },
	waterway_line_label: { 'text-color': WATER_TEXT, 'text-halo-color': MAP },
	water_name_point_label: { 'text-color': WATER_TEXT, 'text-halo-color': MAP },
	water_name_line_label: { 'text-color': WATER_TEXT, 'text-halo-color': MAP },
	'highway-name-path': { 'text-color': MUTED, 'text-halo-color': STREET },
	'highway-name-minor': { 'text-color': MUTED, 'text-halo-color': STREET },
	'highway-name-major': { 'text-color': MUTED, 'text-halo-color': STREET },
	label_other: { 'text-color': MUTED, 'text-halo-color': MAP },
	label_village: { 'text-color': INK, 'text-halo-color': MAP },
	label_town: { 'text-color': INK, 'text-halo-color': MAP },
	label_state: { 'text-color': MUTED, 'text-halo-color': MAP },
	label_city: { 'text-color': INK, 'text-halo-color': MAP },
	label_city_capital: { 'text-color': INK, 'text-halo-color': MAP },
	label_country_3: { 'text-color': INK, 'text-halo-color': MAP },
	label_country_2: { 'text-color': INK, 'text-halo-color': MAP },
	label_country_1: { 'text-color': INK, 'text-halo-color': MAP }
};

type Layer = {
	id: string;
	source?: string;
	'source-layer'?: string;
	layout?: Record<string, unknown>;
	paint?: Record<string, unknown>;
};
type Style = {
	name?: string;
	sprite?: unknown;
	sources: Record<string, unknown>;
	layers: Layer[];
	[key: string]: unknown;
};

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Could not download ${SOURCE_URL}: ${response.status}`);
const style = (await response.json()) as Style;

const layers = style.layers
	.filter((layer) => !DROPPED_LAYERS.has(layer.id))
	.filter((layer) => !DROPPED_SOURCE_LAYERS.has(layer['source-layer'] ?? ''))
	.map((layer) => {
		// Without a sprite, place labels keep their text and lose the small dot icon.
		const layout = layer.layout
			? Object.fromEntries(Object.entries(layer.layout).filter(([key]) => !key.startsWith('icon-')))
			: undefined;
		const paint = COLORS[layer.id] ? { ...layer.paint, ...COLORS[layer.id] } : layer.paint;
		return { ...layer, ...(layout && { layout }), ...(paint && { paint }) };
	});

const unknownIds = Object.keys(COLORS).filter((id) => !layers.some((layer) => layer.id === id));
if (unknownIds.length)
	console.warn(`⚠ Colors for layers missing upstream: ${unknownIds.join(', ')}`);

// Keep only the sources some layer still uses (drops the low-zoom shaded relief).
const usedSources = new Set(layers.map((layer) => layer.source).filter(Boolean));
const sources = Object.fromEntries(
	Object.entries(style.sources).filter(([name]) => usedSources.has(name))
);

delete style.sprite;
const output = { ...style, name: 'Latte (from OpenFreeMap Positron)', sources, layers };
await writeFile(OUTPUT, `${JSON.stringify(output, null, '\t')}\n`);
console.log(`✔ ${OUTPUT}: ${layers.length} layers, sources: ${[...usedSources].join(', ')}`);
