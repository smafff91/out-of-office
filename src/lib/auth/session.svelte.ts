/**
 * Who is signed in, and the sign-in actions. Browser-only: the server renders everyone as
 * "loading", so the account icon never flashes the wrong state.
 *
 * - startSession() runs once from the root layout: restores the stored session (supabase-js
 *   keeps it across visits and refreshes the token) and loads the user's own profile.
 * - openSignIn() opens the single SignInSheet mounted in the root layout. Feature 7b opens it
 *   with { context: 'contribution', onsignedin } when the user sends an update.
 * - Language: on sign-in the latest explicit choice wins, this device's or the profile's
 *   (locale-sync.ts); a profile without a language takes the one in use. Later changes made
 *   while signed in update the profile. The sign-in email itself follows the profile, so the
 *   first email after a change made while signed out can still be in the previous language.
 */
import { SvelteMap } from 'svelte/reactivity';
import { PUBLIC_AUTH_REDIRECT_URL } from '$app/env/public';
import {
	getLocale,
	onLocaleChange,
	savedChoice,
	setLocale,
	type Locale
} from '#lib/i18n/locale.ts';
import { resolveLocale } from '#lib/i18n/locale-sync.ts';
import { getAuthClient } from '#lib/supabase/client.ts';
import {
	fetchMyProfile,
	updateMyProfile,
	type Profile,
	type ProfileUpdate
} from '#lib/supabase/profile.ts';
import type { AuthErrorKind } from './errors.ts';
import { runBeforeLeave, stash } from './handoff.ts';
import { buildReturnUrl } from './next.ts';

export type SignInContext = 'menu' | 'contribution';

export type SignInOptions = {
	context?: SignInContext;
	/** Called after a sign-in that did not leave the page (email code). */
	onsignedin?: () => void;
	/** Shown when the sheet opens (e.g. Google sign-in canceled). */
	error?: AuthErrorKind;
};

/** Stashed before the Google redirect, read back by the root layout after the return. */
export const PENDING_SIGN_IN_KEY = 'auth:pending';
export type PendingSignIn = { context: SignInContext; error?: AuthErrorKind };

class Session {
	status = $state<'loading' | 'signed-out' | 'signed-in'>('loading');
	userId = $state<string>();
	profile = $state<Profile>();
}

export const session = new Session();

export const signInSheet = $state<{ open: boolean; options: SignInOptions }>({
	open: false,
	options: {}
});

export function openSignIn(options: SignInOptions = {}) {
	signInSheet.options = options;
	signInSheet.open = true;
}

export function closeSignIn() {
	signInSheet.open = false;
}

let started = false;

export function startSession() {
	if (started) return;
	started = true;
	const auth = getAuthClient().auth;

	auth.onAuthStateChange((_event, current) => {
		// supabase-js asks not to await other Supabase calls inside this callback.
		setTimeout(() => void applySession(current?.user.id));
	});

	onLocaleChange(async (next) => {
		if (session.userId) {
			await updateMyProfile(session.userId, { locale: next, localeChosenAt: Date.now() });
		}
	});
}

async function applySession(userId: string | undefined) {
	if (!userId) {
		session.status = 'signed-out';
		session.userId = undefined;
		session.profile = undefined;
		return;
	}
	if (session.userId === userId && session.profile) return;
	session.userId = userId;
	session.status = 'signed-in';
	try {
		session.profile = await fetchMyProfile(userId);
	} catch {
		// Offline or not created yet: the icon still shows the signed-in state.
		return;
	}
	await syncLocale(userId, session.profile);
}

async function syncLocale(userId: string, profile: Profile) {
	const sync = resolveLocale({
		current: getLocale(),
		device: savedChoice(),
		profile: { locale: profile.locale, chosenAt: profile.localeChosenAt }
	});
	if (sync.action === 'save') {
		await saveProfile({ locale: sync.locale as Locale, localeChosenAt: sync.chosenAt }).catch(
			() => {}
		);
	} else if (sync.action === 'apply' && session.userId === userId) {
		setLocale(sync.locale as Locale);
	}
}

/** Saves fields of the signed-in user's profile and keeps the local copy in step. */
export async function saveProfile(update: ProfileUpdate) {
	if (!session.userId) throw new Error('Not signed in');
	await updateMyProfile(session.userId, update);
	if (session.profile) {
		const { displayName, showName, locale, localeChosenAt } = update;
		session.profile = {
			...session.profile,
			...(displayName !== undefined && { displayName }),
			...(showName !== undefined && { showName }),
			...(locale !== undefined && { locale }),
			...(localeChosenAt !== undefined && { localeChosenAt })
		};
	}
}

/** Leaves for Google; the user comes back to `next` through /auth/callback. */
export async function signInWithGoogle(next: string, context: SignInContext) {
	runBeforeLeave();
	stash(PENDING_SIGN_IN_KEY, { context } satisfies PendingSignIn);
	const { error } = await getAuthClient().auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: buildReturnUrl(next, PUBLIC_AUTH_REDIRECT_URL),
			queryParams: { prompt: 'select_account' }
		}
	});
	if (error) throw error;
}

/**
 * One email with a 6-digit code (typed on this page) and a link (back to `next`). The language
 * goes into the metadata of a new user, so even the first email is in the right language.
 */
/** Codes asked for, per address, since the page loaded: each new code voids the earlier ones. */
const codeRequests = new SvelteMap<string, number>();
export const codeRequestCount = (email: string) => codeRequests.get(email.toLowerCase()) ?? 0;

export async function sendEmailCode(email: string, next: string) {
	const { error } = await getAuthClient().auth.signInWithOtp({
		email,
		options: {
			shouldCreateUser: true,
			// The email comes in the language of this page, even for a returning user whose
			// profile has another one (lang); data.locale only sets the profile of a new user.
			emailRedirectTo: buildReturnUrl(next, PUBLIC_AUTH_REDIRECT_URL, getLocale()),
			data: { locale: getLocale() }
		}
	});
	if (error) throw error;
	codeRequests.set(email.toLowerCase(), codeRequestCount(email) + 1);
}

export async function verifyEmailCode(email: string, token: string) {
	const { data, error } = await getAuthClient().auth.verifyOtp({ email, token, type: 'email' });
	if (error) throw error;
	await applySession(data.user?.id);
}

/** Signs out on this device only. */
export async function signOut() {
	await getAuthClient().auth.signOut({ scope: 'local' });
}
