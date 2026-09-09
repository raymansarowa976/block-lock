import type { TimeLimit } from "@block-lock/shared-types"
import { sanitiseDomain } from "./sanitise-domain"
import { addUsageMinutes } from "./usage-tracker"
import { applyBlockRules } from "./rule-engine"

export const USAGE_TICK_ALARM = "usage-tick"
const TICK_INTERVAL_MINUTES = 1

export function registerUsageTickAlarm(): void {
  chrome.alarms.create(USAGE_TICK_ALARM, { periodInMinutes: TICK_INTERVAL_MINUTES })
}

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

export async function handleUsageTick(now: Date = new Date()): Promise<void> {
  const { rules } = await chrome.storage.local.get("rules")
  const activeRules: TimeLimit[] = rules ?? []
  const limited = activeRules.filter((r) => r.isActive && r.dailyLimit !== null)
  if (limited.length === 0) return

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const hostname = activeTab?.url ? extractHostname(activeTab.url) : null
  const domain = hostname ? sanitiseDomain(hostname) : null
  if (!domain) return

  const rule = limited.find((r) => sanitiseDomain(r.domain) === domain)
  if (!rule) return

  await addUsageMinutes(domain, 1, now)
  await applyBlockRules(activeRules)
}
