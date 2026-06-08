import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { aggregateWeeklyUsage, TRAILING_WINDOW_DAYS } from "@/lib/insights/aggregate-usage"
import { generateProductivityInsight } from "@/lib/ai/productivity-coach"

const DAY_MS = 24 * 60 * 60 * 1000

// Triggered by Vercel Cron (see vercel.json). Vercel attaches the configured
// CRON_SECRET as a bearer token to every cron request — verifying it here
// stops anyone else from triggering (and burning OpenAI spend on) this route.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const since = new Date(Date.now() - TRAILING_WINDOW_DAYS * DAY_MS)
  const active = await prisma.usageLog.findMany({
    where: { loggedAt: { gte: since } },
    select: { userId: true },
    distinct: ["userId"],
  })

  let processed = 0

  for (const { userId } of active) {
    try {
      const summary = await aggregateWeeklyUsage(userId)
      if (summary.domains.length === 0) continue

      const markdown = await generateProductivityInsight(summary)

      await prisma.productivityInsight.create({
        data: {
          userId,
          periodStart: new Date(summary.periodStart),
          periodEnd: new Date(summary.periodEnd),
          summary: markdown,
        },
      })

      processed++
    } catch {
      // One user's failure (e.g. model outage) shouldn't block the rest of the batch.
      continue
    }
  }

  return NextResponse.json({ processed }, { status: 200 })
}
