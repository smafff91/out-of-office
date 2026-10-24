# platform

Adapters for device features: geolocation, camera/photo upload, sharing, opening external apps.

Today they wrap browser APIs; after launch they will wrap Capacitor plugins with the same interface.
Components never call these APIs directly: they import from here.

## Sign-in in the app (Capacitor) — to do with the app build

Today sign-in returns to `PUBLIC_AUTH_REDIRECT_URL` (the `/auth/callback` page). For the app:

- **Return URL:** build the app with `PUBLIC_AUTH_REDIRECT_URL=https://<domain>/auth/callback` as a
  **universal link** (iOS: `apple-app-site-association`; Android: App Links, `assetlinks.json`, both
  served from the domain). A custom scheme (`com.<app>://auth/callback`) is simpler but any app can
  claim it. Add the URL to `additional_redirect_urls` in `supabase/config.toml`.
- **Google:** Google refuses OAuth inside web views, so open the URL from `signInWithOAuth`
  (`skipBrowserRedirect: true`) in the system browser (`@capacitor/browser`), listen to
  `App.addListener('appUrlOpen')`, close the browser and pass `code` to the same logic as
  `src/routes/auth/callback` (`exchangeCodeForSession`; PKCE is already on). Adapter:
  `src/lib/platform/auth-browser.ts`.
- **Email:** the 6-digit code works in the app as is. The link opens the universal link, which
  lands on the callback in the app (or in the browser if the app is not installed).
  The email language travels as `lang` in the return URL (`buildReturnUrl`): it works the same
  with the universal link or a custom scheme (the send-email function reads it with `new URL`).
