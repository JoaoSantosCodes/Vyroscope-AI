import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
/** Retorna true quando o backend está em modo local (AUTH_PROVIDER=local). */
export const isLocalAuthProvider = () =>
  import.meta.env.VITE_AUTH_PROVIDER === "local";

/** Login local: posta o código/nome em /api/local-auth e navega em caso de sucesso. */
export const loginLocally = async (code: string, name: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch("/api/local-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), name: name.trim() }),
    });
    if (res.ok) {
      window.location.href = "/";
      return { ok: true };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: res.status === 401 ? "Código inválido" : (body?.error ?? "Falha no login") };
  } catch {
    return { ok: false, error: "Falha de rede" };
  }
};

export const startLogin = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const nonce = crypto.randomUUID();
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  window.location.href = url.toString();
};
