"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export type Scope = "day" | "week" | "month"

export type AnalyticsDataPoint = {
  date: string
  totalMinutes: number
  savedMinutes: number
}

const SCOPE_MS: Record<Scope, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
}

export async function getAnalyticsData(
  scope: Scope,
): Promise<{ success: true; data: AnalyticsDataPoint[] } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  const userId = session.user.id
  const gte = new Date(Date.now() - SCOPE_MS[scope])

  const logs = await prisma.usageLog.findMany({
    where: { userId, loggedAt: { gte } },
  })

  // Group by calendar day (UTC) and aggregate minutes
  const byDay = new Map<string, { total: number; saved: number }>()

  for (const log of logs) {
    const date = log.loggedAt.toISOString().split("T")[0]
    const existing = byDay.get(date) ?? { total: 0, saved: 0 }
    existing.total += log.duration
    if (log.blockedAt !== null) existing.saved += log.duration
    byDay.set(date, existing)
  }

  const data: AnalyticsDataPoint[] = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, saved }]) => ({
      date,
      totalMinutes: Math.round(total / 60),
      savedMinutes: Math.round(saved / 60),
    }))

  return { success: true, data }
}
