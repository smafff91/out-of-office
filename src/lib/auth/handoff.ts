/**
 * Keeping work across a page change: the redirect to Google and the reload after a language
 * change. Feature 7b saves the contribution draft here and gets it back after the return.
 *
 *   // Contribution form (7b):
 *   onMount(() => {
 *     const draft = takeStash<Draft>(`contribution:${placeId}`);   // after the return
 *     if (draft) restore(draft);
 *     return onBeforeLeave(() => stash(`contribution:${placeId}`, currentDraft()));
 *   });
 *
 * sessionStorage, not localStorage: the draft belongs to this tab and is gone when it closes
 * (CLAUDE.md: nothing important in localStorage). Every access is wrapped: blocked storage
 * (private mode, settings) only means the draft is not kept.
 * The email code never leaves the page, so it needs none of this.
 */

const PREFIX = 'handoff:';
const listeners = new Set<() => void>();

/** Registers a function that saves state before the page goes away. Returns the unsubscribe. */
export function onBeforeLeave(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Called right before leaving: the Google redirect and the language reload. */
export function runBeforeLeave() {
	for (const listener of listeners) {
		try {
			listener();
		} catch {
			// One failing listener must not block the others or the navigation.
		}
	}
}

export function stash(key: string, value: unknown, storage: Storage | undefined = sessionStore()) {
	try {
		storage?.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		// Blocked or full: the state is simply not kept.
	}
}

/** Reads and removes: a stashed value is restored once. */
export function takeStash<T>(
	key: string,
	storage: Storage | undefined = sessionStore()
): T | undefined {
	try {
		const raw = storage?.getItem(PREFIX + key);
		if (raw == null) return undefined;
		storage?.removeItem(PREFIX + key);
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

function sessionStore(): Storage | undefined {
	try {
		return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
	} catch {
		return undefined;
	}
}
