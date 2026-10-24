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
