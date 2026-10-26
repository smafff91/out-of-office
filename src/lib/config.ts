// Provisional name: change it here only, never hard-code it elsewhere.
export const APP_NAME = 'Out of Office';

/** The launch message ("We're just getting started here") shows while a city has fewer certified places. */
export const LAUNCH_MESSAGE_MAX_CERTIFIED = 20;

/** How long the sign-in code and link stay valid. Same value as otp_expiry in supabase/config.toml. */
export const OTP_EXPIRY_SECONDS = 900;

/** Wait before "Send a new code" works again (Supabase refuses faster resends: max_frequency). */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Longest public name: the same limit as the check on profiles.display_name. */
export const DISPLAY_NAME_MAX_LENGTH = 30;

/**
 * After too many wrong codes Supabase refuses checks for a while without saying how long: the
 * window of [auth.rate_limit] token_verifications in supabase/config.toml (5 minutes).
 */
export const VERIFY_LOCKOUT_SECONDS = 300;

/**
 * Version of the Terms the user accepts by sending photos, saved on each photo
 * (photos.terms_version, format YYYY-MM-DD). Change it when the Terms change.
 */
export const TERMS_VERSION = '2026-10-29';

/** Photos per update: the same value as certification_settings.photos_per_contribution. */
export const PHOTOS_PER_CONTRIBUTION = 3;

/**
 * The two WebP versions of a photo. The buckets refuse files above 1 MiB and 150 KiB
 * (supabase/migrations/20261029130000_photo_storage.sql): the targets stay below.
 */
export const PHOTO_LARGE = { edge: 1200, maxBytes: 900_000 } as const;
export const PHOTO_THUMB = { edge: 400, maxBytes: 140_000 } as const;
