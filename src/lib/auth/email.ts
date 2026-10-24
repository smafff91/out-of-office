/** A light check before asking Supabase: something@something.tld, no spaces. */
export function looksLikeEmail(raw: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}
