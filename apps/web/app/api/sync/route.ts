import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { NextResponse } from "next/server"

const CACHE_TTL_SECONDS = 300 // 5-minute TTL matches the extension's sync interval

function cacheKey(userId: string) {
  return `user:rules:${userId}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  // ── Cache read ──────────────────────────────────────────────────────────
  const cached = await redis.get(cacheKey(userId))
  if (cached) {
    return NextResponse.json(JSON.parse(cached as string))
  }

  // ── Cache miss: query Prisma, write back, respond ───────────────────────
  const timeLimits = await prisma.timeLimit.findMany({
    where: { userId },
    include: { schedules: true },
  })

  const payload = {
    userId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rules: timeLimits.map(({ schedules: _s, ...rule }) => rule),
    schedules: timeLimits.flatMap((tl) => tl.schedules),
    syncedAt: new Date(),
  }

  await redis.set(cacheKey(userId), JSON.stringify(payload), { ex: CACHE_TTL_SECONDS })

  return NextResponse.json(payload)
}