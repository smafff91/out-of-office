/**
 * "A place changed": sent after an update so the city map and list fetch the place again
 * (a gray pin becomes a community one, scores move). In memory, this tab only.
 */
const listeners = new Set<(slug: string) => void>();

export function onPlaceUpdated(listener: (slug: string) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function notifyPlaceUpdated(slug: string) {
	for (const listener of listeners) listener(slug);
}
