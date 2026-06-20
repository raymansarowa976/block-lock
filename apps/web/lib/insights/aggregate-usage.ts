import { prisma } from "@/lib/prisma"
import type { UsageDomainAggregate, WeeklyUsageSummary } from "@block-lock/shared-types"

export const TRAILING_WINDOW_DAYS = 7
export const MICRO_RELAPSE_WINDOW_MINUTES = 30

const DAY_MS = 24 * 60 * 60 * 1000
const RELAPSE_WINDOW_MS = MICRO_RELAPSE_WINDOW_MINUTES * 60_000

interface UsageLogLike {
  domain: string
  duration: number
  blockedAt: Date | null
  loggedAt: Date
}

// A "micro-relapse" is a session that begins shortly after the user was
// blocked on the same domain — i.e. they kept retrying a domain they were
// just stopped from visiting, rather than moving on.
function countMicroRelapses(domainLogs: UsageLogLike[]): number {
  const sorted = [...domainLogs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())

  let relapses = 0
  let lastBlockedAt: Date | null = null

  for (const log of sorted) {
    if (lastBlockedAt && log.loggedAt.getTime() - lastBlockedAt.getTime() <= RELAPSE_WINDOW_MS) {
      relapses++
    }
    if (log.blockedAt) lastBlockedAt = log.blockedAt
  }

  return relapses
}

export function computeDomainAggregates(logs: UsageLogLike[]): UsageDomainAggregate[] {
  const byDomain = new Map<string, UsageLogLike[]>()
  for (const log of logs) {
    const existing = byDomain.get(log.domain)
    if (existing) existing.push(log)
    else byDomain.set(log.domain, [log])
  }

  return Array.from(byDomain.entries()).map(([domain, domainLogs]) => ({
    domain,
    totalMinutes: Math.round(domainLogs.reduce((sum, log) => sum + log.duration, 0) / 60),
    sessionCount: domainLogs.length,
    blockedCount: domainLogs.filter((log) => log.blockedAt !== null).length,
    microRelapses: countMicroRelapses(domainLogs),
  }))
}

export async function aggregateWeeklyUsage(userId: string): Promise<WeeklyUsageSummary> {
  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - TRAILING_WINDOW_DAYS * DAY_MS)

  const logs = await prisma.usageLog.findMany({
    where: { userId, loggedAt: { gte: periodStart, lte: periodEnd } },
    orderBy: { loggedAt: "asc" },
  })

  return {
    userId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    domains: computeDomainAggregates(logs),
  }
}
