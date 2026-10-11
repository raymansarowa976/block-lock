import type { SyncPayload } from "@block-lock/shared-types"
import { applyBlockRules } from "./rule-engine"
import { API_BASE } from "./config"

export const ALLOWED_ORIGINS = [
  "https://blocklock.app",
  "http://localhost:3000",
]

// The credential is a short-lived signed token minted from an authenticated
// dashboard session (apps/web/app/api/sync/token/route.ts), not a bare
// userId — a bare cuid never expires and can't be revoked short of deleting
// the account. userId still rides along purely for the popup's "Connected"
// display; /api/sync itself only trusts the token.
export type AuthMessage = {
  type: "BLOCK_LOCK_AUTH"
  userId: string
  token: string
  expiresAt: number
}
export type SignoutMessage = { type: "BLOCK_LOCK_SIGNOUT" }
export type RulesUpdatedMessage = { type: "BLOCK_LOCK_RULES_UPDATED" }
export type SyncNowMessage = { type: "BLOCK_LOCK_SYNC_NOW" }
export type ExtMessage = AuthMessage | SignoutMessage | RulesUpdatedMessage | SyncNowMessage

export type SyncError = "network" | "server" | "rules"

// A failed sync is retried on its own one-shot alarm with exponential backoff
// (30s, 1m, 2m, 4m), capped at the periodic sync interval in background.ts,
// beyond which the periodic alarm alone keeps retrying.
export const SYNC_RETRY_ALARM = "sync-retry"
const SYNC_RETRY_BASE_MINUTES = 0.5
const SYNC_RETRY_MAX_MINUTES = 5

function clearCredential() {
  return { userId: null, token: null, tokenExpiresAt: null }
}

export async function handleExternalMessage(
  message: ExtMessage,
  sender: { url?: string },
  sendResponse: (response: unknown) => void,
): Promise<void> {
  const originAllowed =
    sender.url && ALLOWED_ORIGINS.some((o) => sender.url!.startsWith(o))

  if (!originAllowed) {
    sendResponse({ ok: false, error: "forbidden" })
    return
  }

  if (message.type === "BLOCK_LOCK_AUTH") {
    await chrome.storage.local.set({
      userId: message.userId,
      token: message.token,
      tokenExpiresAt: message.expiresAt,
      authError: null,
      syncError: null,
      syncFailures: 0,
    })
    syncRules().catch(() => {})
    sendResponse({ ok: true })
    return
  }

  if (message.type === "BLOCK_LOCK_SIGNOUT") {
    await signOut()
    sendResponse({ ok: true })
    return
  }

  if (message.type === "BLOCK_LOCK_RULES_UPDATED") {
    await syncRules()
    sendResponse({ ok: true })
  }
}

// Popup-originated messages (chrome.runtime.sendMessage): sign-out, the local
// "Disconnect" fallback for when the dashboard is unreachable and so can't
// send BLOCK_LOCK_SIGNOUT itself, and an on-open sync. Credentials must still
// only ever arrive from the dashboard via handleExternalMessage.
export async function handleInternalMessage(
  message: ExtMessage,
  sender: { id?: string; tab?: unknown },
  sendResponse: (response: unknown) => void,
): Promise<void> {
  // Extension pages (the popup) have no `tab`; anything with one came from a
  // tab context rather than our own UI.
  if (sender.id !== chrome.runtime.id || sender.tab) {
    sendResponse({ ok: false, error: "forbidden" })
    return
  }

  if (message.type === "BLOCK_LOCK_SIGNOUT") {
    await signOut()
    sendResponse({ ok: true })
    return
  }

  if (message.type === "BLOCK_LOCK_SYNC_NOW") {
    await syncRules()
    sendResponse({ ok: true })
    return
  }

  sendResponse({ ok: false, error: "unsupported" })
}

async function signOut(): Promise<void> {
  // Best-effort server-side revocation — the extension has no dashboard
  // session, only the token itself, so it authenticates the revoke call
  // with that. Local state is cleared either way; a failed revoke just
  // means the token rides out its own 15-minute TTL instead of dying
  // immediately.
  const { token } = await chrome.storage.local.get(["token"])
  if (token) {
    try {
      await fetch(`${API_BASE}/sync/revoke?token=${token}`, { method: "POST" })
    } catch {
      // Network failure — proceed to clear local state regardless.
    }
  }

  await chrome.storage.local.set({ ...clearCredential(), authError: null, lastSync: null, syncError: null })
}

async function recordSyncFailure(syncError: SyncError, previousFailures: number): Promise<void> {
  const delayInMinutes = Math.min(
    SYNC_RETRY_BASE_MINUTES * 2 ** previousFailures,
    SYNC_RETRY_MAX_MINUTES,
  )
  await chrome.storage.local.set({ syncError, syncFailures: previousFailures + 1 })
  chrome.alarms.create(SYNC_RETRY_ALARM, { delayInMinutes })
}

export async function syncRules(): Promise<void> {
  const { token, tokenExpiresAt, syncFailures } = await chrome.storage.local.get([
    "token",
    "tokenExpiresAt",
    "syncFailures",
  ])
  if (!token) return
  const previousFailures = typeof syncFailures === "number" ? syncFailures : 0

  // Catch an expired token locally before spending a round-trip on a 401 —
  // this is the expiry path that actually drives the popup's session_expired
  // state once a dashboard tab has been closed long enough for the token to lapse.
  if (typeof tokenExpiresAt === "number" && Date.now() >= tokenExpiresAt) {
    await chrome.storage.local.set({ ...clearCredential(), authError: "session_expired" })
    return
  }

  // Non-auth failures are recorded as syncError rather than thrown, so the
  // popup can say why it's stuck on "Never synced" instead of failing silently,
  // and schedule a quick retry. Auth failures aren't retried: only a new
  // login from the dashboard can fix those.
  let res: Response
  try {
    res = await fetch(`${API_BASE}/sync?token=${token}`)
  } catch {
    await recordSyncFailure("network", previousFailures)
    return
  }

  if (res.status === 401 || res.status === 403) {
    await chrome.storage.local.set({ ...clearCredential(), authError: "session_expired" })
    return
  }

  if (!res.ok) {
    await recordSyncFailure("server", previousFailures)
    return
  }

  try {
    const payload: SyncPayload = await res.json()
    await applyBlockRules(payload.rules, payload.schedules)
  } catch {
    await recordSyncFailure("rules", previousFailures)
    return
  }

  await chrome.storage.local.set({ syncError: null, syncFailures: 0 })
  await chrome.alarms.clear(SYNC_RETRY_ALARM)
}