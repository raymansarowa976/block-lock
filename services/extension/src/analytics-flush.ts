import type { UsageEntry } from "./analytics-buffer"
import { API_BASE } from "./config"

export const FLUSH_ALARM = "analytics-flush"
const FLUSH_INTERVAL_MINUTES = 5

export function registerFlushAlarm(): void {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_INTERVAL_MINUTES })
}

export async function flushAnalytics(): Promise<void> {
  const { userId, analyticsBuffer } = await chrome.storage.local.get([
    "userId",
    "analyticsBuffer",
  ])

  if (!userId || !analyticsBuffer?.length) return

  try {
    const res = await fetch(`${API_BASE}/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: analyticsBuffer as UsageEntry[] }),
    })

    if (res.ok) {
      await chrome.storage.local.set({ analyticsBuffer: [] })
    }
  } catch {
    // Network failure — leave buffer intact for next flush cycle
  }
}
