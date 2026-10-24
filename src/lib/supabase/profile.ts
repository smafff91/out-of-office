/**
 * The signed-in user's own profile (RLS: nobody else can read or change it). Public names
 * reach other people only through the place_contributors view, when show_name is true.
 */
import { displayNameProblem, normalizeDisplayName } from '#lib/auth/display-name.ts';
import type { Locale } from '#lib/i18n/locale.ts';
import { createSupabaseClient } from './client.ts';

export type Profile = {
	displayName: string | null;
	/** null until the user chooses ("Show my name on places" / "Stay anonymous"). */
	showName: boolean | null;
	locale: Locale | null;
	/** When the language was last picked (ms), to let the latest choice win on sign-in. */
	localeChosenAt?: number;
	foundingContributor: boolean;
};

export type ProfileUpdate = {
	displayName?: string | null;
	showName?: boolean;
	locale?: Locale;
	localeChosenAt?: number;
};

export async function fetchMyProfile(userId: string): Promise<Profile> {
	const { data, error } = await createSupabaseClient()
		.from('profiles')
		.select('display_name, show_name, locale, locale_chosen_at, founding_contributor')
		.eq('id', userId)
		.single();
	if (error) throw error;
	return {
		displayName: data.display_name,
		showName: data.show_name,
		locale: data.locale as Locale | null,
		localeChosenAt: data.locale_chosen_at ? Date.parse(data.locale_chosen_at) : undefined,
		foundingContributor: data.founding_contributor
	};
}

/** Saves the given fields. A name is normalized first and refused if invalid. */
export async function updateMyProfile(userId: string, update: ProfileUpdate): Promise<void> {
	const row: {
		display_name?: string | null;
		show_name?: boolean;
		locale?: string;
		locale_chosen_at?: string;
	} = {};
	if (update.displayName !== undefined) {
		const name = update.displayName === null ? null : normalizeDisplayName(update.displayName);
		if (name !== null && displayNameProblem(name)) throw new Error('Invalid display name');
		row.display_name = name;
	}
	if (update.showName !== undefined) row.show_name = update.showName;
	if (update.locale !== undefined) row.locale = update.locale;
	if (update.localeChosenAt !== undefined) {
		row.locale_chosen_at = new Date(update.localeChosenAt).toISOString();
	}

	const { error } = await createSupabaseClient().from('profiles').update(row).eq('id', userId);
	if (error) throw error;
}
