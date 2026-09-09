import type { TimeLimit, Schedule } from "@block-lock/shared-types"
import { sanitiseDomain } from "./sanitise-domain"
import { getMinutesUsedToday } from "./usage-tracker"
import { isWithinAnySchedule } from "./schedule-window"

function groupSchedulesByRule(schedules: Schedule[]): Map<string, Schedule[]> {
  const byRuleId = new Map<string, Schedule[]>()
  for (const schedule of schedules) {
    const list = byRuleId.get(schedule.timeLimitId) ?? []
    list.push(schedule)
    byRuleId.set(schedule.timeLimitId, list)
  }
  return byRuleId
}

async function resolveBlockedDomain(
  rule: TimeLimit,
  schedulesByRule: Map<string, Schedule[]>,
  now: Date,
): Promise<string | null> {
  const domain = sanitiseDomain(rule.domain)
  if (domain === null) return null

  const schedules = schedulesByRule.get(rule.id) ?? []
  if (schedules.length > 0 && !isWithinAnySchedule(schedules, now)) return null

  if (rule.dailyLimit === null) return domain

  const minutesUsed = await getMinutesUsedToday(domain, now)
  return minutesUsed >= rule.dailyLimit ? domain : null
}

export async function applyBlockRules(
  rules: TimeLimit[],
  schedules: Schedule[] = [],
  now: Date = new Date(),
): Promise<void> {
  const schedulesByRule = groupSchedulesByRule(schedules)

  const resolved = await Promise.all(
    rules.filter((r) => r.isActive).map((r) => resolveBlockedDomain(r, schedulesByRule, now)),
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

  await chrome.storage.local.set({ lastSync: new Date().toISOString(), rules, schedules })
}
