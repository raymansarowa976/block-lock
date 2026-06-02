import type { SyncPayload } from "@block-lock/shared-types"
import { applyBlockRules } from "./rule-engine"

const API_BASE = import.meta.env.VITE_API_BASE ?? "https://block-lock.vercel.app/api"

export const ALLOWED_ORIGINS = [
  "https://block-lock.vercel.app",
  "http://localhost:3000",
]

export type AuthMessage = { type: "BLOCK_LOCK_AUTH"; userId: string }
export type SignoutMessage = { type: "BLOCK_LOCK_SIGNOUT" }
export type ExtMessage = AuthMessage | SignoutMessage

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
    await chrome.storage.local.set({ userId: message.userId, authError: null })
    syncRules()
    sendResponse({ ok: true })
    return
  }

  if (message.type === "BLOCK_LOCK_SIGNOUT") {
    await chrome.storage.local.set({ userId: null, authError: null, lastSync: null })
    sendResponse({ ok: true })
  }
}

export async function syncRules(): Promise<void> {
  const { userId } = await chrome.storage.local.get("userId")
  if (!userId) return

  const res = await fetch(`${API_BASE}/sync?userId=${userId}`)

  if (res.status === 401 || res.status === 403) {
    await chrome.storage.local.set({ authError: "session_expired", userId: null })
    return
  }

  if (!res.ok) return

  const payload: SyncPayload = await res.json()
  await applyBlockRules(payload)
}