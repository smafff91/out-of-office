/**
 * A place photo, whatever its source (our users, our team, an openly licensed archive…).
 * Every photo carries who took it and under which license or permission, shown under it.
 * No source is connected yet: place pages pass an empty list and show the placeholder.
 * Never photos from Google or scraped from other sites.
 */
export type PlacePhoto = {
	url: string;
	width?: number;
	height?: number;
	/** Public name of the author, as they agreed to be credited. */
	author: string;
	/** Where the photo comes from, e.g. the app's users or an archive name. */
	source: string;
	/** License or permission, e.g. "CC BY-SA 4.0" or the terms the uploader accepted. */
	license: string;
	/** Page of the license or of the original photo, when there is one. */
	licenseUrl?: string;
};
