/**
 * Sharing a link: the system share sheet when there is one (Web Share API today, the Capacitor
 * Share plugin in the app), otherwise the link is copied to the clipboard.
 */

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareLink(link: { title: string; url: string }): Promise<ShareResult> {
	if (typeof navigator === 'undefined') return 'failed';
	if (navigator.share) {
		try {
			await navigator.share(link);
			return 'shared';
		} catch (error) {
			// The user closed the share sheet: nothing else to do.
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		}
	}
	try {
		await navigator.clipboard.writeText(link.url);
		return 'copied';
	} catch {
		return 'failed';
	}
}
