import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { NextResponse } from "next/server"

const CACHE_TTL_SECONDS = 300  // 5-minute TTL matches the extension's sync interval

function cacheKey(userId: string) {
  return `user:rules:${userId}`
}

export async function GET(_request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const key = cacheKey(userId)

  // ── Cache read ──────────────────────────────────────────────────────────
  const cached = await redis.get(key)
  if (cached) {
    return NextResponse.json(JSON.parse(cached))
  }

  // ── Cache miss: query Prisma, write back, respond ───────────────────────
  const timeLimits = await prisma.timeLimit.findMany({
    where: { userId },
    include: { schedules: true },
  })

  const payload = {
    userId,
    rules: timeLimits.map(({ schedules: _s, ...rule }) => rule),
    schedules: timeLimits.flatMap((tl) => tl.schedules),
    syncedAt: new Date(),
  }

  await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(payload))

  return NextResponse.json(payload)
}