/**
 * A place photo, whatever its source. Today: the app's users (src/lib/supabase/photos.ts),
 * credited only when they chose to show their name. Later sources (our team, feature 9) use the
 * same shape. Never photos from Google or scraped from other sites.
 */
export type PlacePhoto = {
	/** The 1200 px version. */
	url: string;
	/** The 400 px version, for tiles and list rows. */
	thumbUrl: string;
	width?: number;
	height?: number;
	/** Public name of the author, only when they chose to show it ("Photo by …"). */
	author?: string;
};
