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
export type ExtMessage = AuthMessage | SignoutMessage | RulesUpdatedMessage

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
    })
    syncRules().catch(() => {})
    sendResponse({ ok: true })
    return
  }

  if (message.type === "BLOCK_LOCK_SIGNOUT") {
    await chrome.storage.local.set({ ...clearCredential(), authError: null, lastSync: null })
    sendResponse({ ok: true })
    return
  }

  if (message.type === "BLOCK_LOCK_RULES_UPDATED") {
    await syncRules()
    sendResponse({ ok: true })
  }
}

export async function syncRules(): Promise<void> {
  const { token, tokenExpiresAt } = await chrome.storage.local.get(["token", "tokenExpiresAt"])
  if (!token) return

  // Catch an expired token locally before spending a round-trip on a 401 —
  // this is the expiry path that actually drives the popup's session_expired
  // state once a dashboard tab has been closed long enough for the token to lapse.
  if (typeof tokenExpiresAt === "number" && Date.now() >= tokenExpiresAt) {
    await chrome.storage.local.set({ ...clearCredential(), authError: "session_expired" })
    return
  }

  const res = await fetch(`${API_BASE}/sync?token=${token}`)

  if (res.status === 401 || res.status === 403) {
    await chrome.storage.local.set({ ...clearCredential(), authError: "session_expired" })
    return
  }

  if (!res.ok) return

  const payload: SyncPayload = await res.json()
  await applyBlockRules(payload.rules, payload.schedules)
}