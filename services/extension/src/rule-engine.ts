import type { TimeLimit } from "@block-lock/shared-types"
import { sanitiseDomain } from "./sanitise-domain"
import { getMinutesUsedToday } from "./usage-tracker"

async function resolveBlockedDomain(rule: TimeLimit): Promise<string | null> {
  const domain = sanitiseDomain(rule.domain)
  if (domain === null) return null
  if (rule.dailyLimit === null) return domain

  const minutesUsed = await getMinutesUsedToday(domain)
  return minutesUsed >= rule.dailyLimit ? domain : null
}

export async function applyBlockRules(rules: TimeLimit[]): Promise<void> {
  const resolved = await Promise.all(
    rules.filter((r) => r.isActive).map(resolveBlockedDomain),
  )
  const domains = resolved.filter((d): d is string => d !== null)

  const addRules = domains.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: { extensionPath: `/blocked.html?domain=${domain}` },
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
    },
  }))

  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  const existingIds = existing.map((r) => r.id)

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules,
  })

  await chrome.storage.local.set({ lastSync: new Date().toISOString(), rules })
}
