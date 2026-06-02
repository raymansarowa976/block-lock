import type { SyncPayload } from "@block-lock/shared-types"

const API_BASE = "https://block-lock.vercel.app/api"
const SYNC_ALARM = "sync-rules"
const SYNC_INTERVAL_MINUTES = 5

const ALLOWED_ORIGINS = [
  "https://block-lock.vercel.app",
  "http://localhost:3000",
]

type AuthMessage = { type: "BLOCK_LOCK_AUTH"; userId: string }
type SignoutMessage = { type: "BLOCK_LOCK_SIGNOUT" }
type ExtMessage = AuthMessage | SignoutMessage

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES })
  syncRules()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) syncRules()
})

chrome.runtime.onMessageExternal.addListener(
  (message: ExtMessage, sender, sendResponse) => {
    const originAllowed =
      sender.url && ALLOWED_ORIGINS.some((o) => sender.url!.startsWith(o))

    if (!originAllowed) {
      sendResponse({ ok: false, error: "forbidden" })
      return
    }

    if (message.type === "BLOCK_LOCK_AUTH") {
      chrome.storage.local
        .set({ userId: message.userId, authError: null })
        .then(() => {
          syncRules()
          sendResponse({ ok: true })
        })
      return true // keep channel open for async sendResponse
    }

    if (message.type === "BLOCK_LOCK_SIGNOUT") {
      chrome.storage.local
        .set({ userId: null, authError: null, lastSync: null })
        .then(() => sendResponse({ ok: true }))
      return true
    }
  },
)

async function syncRules(): Promise<void> {
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

async function applyBlockRules(payload: SyncPayload): Promise<void> {
  const rules = payload.rules
    .filter((r) => r.isActive)
    .map((r, index) => ({
      id: index + 1,
      priority: 1,
      action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
      condition: {
        urlFilter: `||${r.domain}^`,
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
      },
    }))

  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  const existingIds = existing.map((r) => r.id)

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: rules,
  })

  await chrome.storage.local.set({ lastSync: new Date().toISOString() })
}