/**
 * Language on sign-in: the device and the profile may disagree. The latest explicit choice
 * wins, so each choice carries its time (localStorage on the device, locale_chosen_at in the
 * profile). A choice without a time counts as older than any timed one.
 */

export type LocaleChoice = { locale: string; chosenAt?: number };

export type LocaleSync =
	| { action: 'none' }
	/** The device's choice is newer (or the profile has none): write it to the profile. */
	| { action: 'save'; locale: string; chosenAt?: number }
	/** The profile's choice is newer, or this device never chose: switch to it. */
	| { action: 'apply'; locale: string };

export function resolveLocale({
	current,
	device,
	profile
}: {
	/** The language on screen now. */
	current: string;
	/** The choice saved on this device, if the user ever made one here. */
	device?: LocaleChoice;
	profile: { locale: string | null; chosenAt?: number };
}): LocaleSync {
	if (!profile.locale) return { action: 'save', locale: current, chosenAt: device?.chosenAt };
	if (!device) {
		return profile.locale === current
			? { action: 'none' }
			: { action: 'apply', locale: profile.locale };
	}
	if (device.locale === profile.locale) return { action: 'none' };
	const deviceTime = device.chosenAt ?? -Infinity;
	const profileTime = profile.chosenAt ?? -Infinity;
	if (deviceTime > profileTime) {
		return { action: 'save', locale: device.locale, chosenAt: device.chosenAt };
	}
	return { action: 'apply', locale: profile.locale };
}
