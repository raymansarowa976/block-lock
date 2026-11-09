import { API_BASE } from "./config"

// Renew this long before the access token's stated expiry, so it can't lapse
// between this check and the server verifying it (or to clock skew).
export const TOKEN_RENEW_SKEW_MS = 60 * 1000

export type AccessTokenResult =
  | { status: "ok"; token: string }
  | { status: "none" }
  | { status: "expired" }
  | { status: "error"; error: "network" | "server" }

export function clearCredential() {
  return { userId: null, token: null, tokenExpiresAt: null, refreshToken: null }
}

// Only a new login from the dashboard can recover from this.
export async function expireSession(): Promise<void> {
  await chrome.storage.local.set({ ...clearCredential(), authError: "session_expired" })
}

// Returns a usable access token for /api/sync and /api/analytics, renewing
// it with the stored refresh token once it's (nearly) expired. Before
// refresh tokens, only an open dashboard tab could re-mint the 15-minute
// access token, so syncing stopped shortly after the tab was closed.
//
// A transient refresh failure keeps the credential so the caller can retry;
// only a rejected refresh token (e.g. after a sign-out) expires the session.
export async function getAccessToken(): Promise<AccessTokenResult> {
  const { token, tokenExpiresAt, refreshToken } = await chrome.storage.local.get([
    "token",
    "tokenExpiresAt",
    "refreshToken",
  ])
  if (!token && !refreshToken) return { status: "none" }

  const expiresAt = typeof tokenExpiresAt === "number" ? tokenExpiresAt : Infinity
  const now = Date.now()

  if (token && now < expiresAt - TOKEN_RENEW_SKEW_MS) return { status: "ok", token }

  if (!refreshToken) {
    // Bound by a dashboard that predates refresh tokens: use the token for
    // as long as it lasts, then catch the expiry locally rather than
    // spending a round-trip on a guaranteed 401.
    if (token && now < expiresAt) return { status: "ok", token }
    await expireSession()
    return { status: "expired" }
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/sync/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    return { status: "error", error: "network" }
  }

  if (res.status === 401 || res.status === 403) {
    await expireSession()
    return { status: "expired" }
  }

  if (!res.ok) return { status: "error", error: "server" }

  let renewed: { token: string; expiresAt: number; refreshToken: string }
  try {
    renewed = await res.json()
  } catch {
    return { status: "error", error: "server" }
  }

  await chrome.storage.local.set({
    token: renewed.token,
    tokenExpiresAt: renewed.expiresAt,
    refreshToken: renewed.refreshToken,
    authError: null,
  })
  return { status: "ok", token: renewed.token }
}
