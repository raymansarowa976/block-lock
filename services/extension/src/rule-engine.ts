import type { SyncPayload, TimeLimit } from "@block-lock/shared-types"
import { sanitiseDomain } from "./sanitise-domain"

export async function applyBlockRules(payload: SyncPayload): Promise<void> {
  const domains = payload.rules
    .filter((r: TimeLimit) => r.isActive)
    .map((r: TimeLimit) => sanitiseDomain(r.domain))
    .filter((d: string | null): d is string => d !== null)

  const rules = domains.map((domain: string, index: number) => ({
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
    addRules: rules,
  })

  await chrome.storage.local.set({ lastSync: new Date().toISOString(), rules: payload.rules })
}