export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

let warnedAboutMissingPortal = false;

/**
 * Whether a hosted sign-in portal is configured at all.
 *
 * When it is not — which is the normal case for a locally-run desktop install — there
 * is nowhere to send the user, so callers must not navigate. Bouncing them to an
 * unrelated page is worse than leaving them where they are.
 */
export const hasLoginPortal = (): boolean => Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL);

/**
 * Build the sign-in URL at runtime so the redirect URI reflects the current origin.
 *
 * This must never throw. It is evaluated as a default argument inside `useAuth`, so
 * an unset `VITE_OAUTH_PORTAL_URL` used to take down every screen that reads auth
 * state. When no portal is configured we return a local route instead and let the
 * UI explain, rather than crashing.
 */
export const getLoginUrl = (): string => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID ?? "";

  if (!oauthPortalUrl) {
    if (!warnedAboutMissingPortal) {
      warnedAboutMissingPortal = true;
      console.warn("VITE_OAUTH_PORTAL_URL is not configured; sign-in links point to Settings.");
    }
    return "/settings";
  }


  try {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const url = new URL(`${oauthPortalUrl.replace(/\/+$/, "")}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", btoa(redirectUri));
    url.searchParams.set("type", "signIn");
    return url.toString();
  } catch {
    // A malformed portal URL is a configuration problem, not a reason to break the app.
    return "/settings";
  }
};
