import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { corsHeaders, handleCorsPreflight } from "@/lib/cors"
import { verifySyncToken } from "@/lib/sync-token"
import { rateLimit } from "@/lib/rate-limit"
import { NextResponse } from "next/server"

const CACHE_TTL_SECONDS = 300 // 5-minute TTL matches the extension's sync interval

function cacheKey(userId: string) {
  return `user:rules:${userId}`
}

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request)
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin")) ?? undefined
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400, headers })
  }

  // The token is a signed, short-lived credential minted from an authenticated
  // dashboard session (see app/api/sync/token/route.ts) — a bare userId is no
  // longer accepted, since that could be replayed indefinitely by anyone who
  // had ever seen it. Verification also checks Redis for a sign-out
  // revocation cutoff (see lib/sync-token.ts), hence the await.
  const verified = await verifySyncToken(token)
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }
  const userId = verified.userId

  // A valid token proves identity, not good intent — a leaked or replayed
  // token can still be used to hammer this route into real Prisma reads and
  // real Upstash writes, so the limiter runs before either is touched.
  const rate = await rateLimit(userId)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      {
        status: 429,
        headers: {
          ...headers,
          "X-RateLimit-Remaining": String(rate.remaining),
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
        },
      },
    )
  }

  // ── Cache read ──────────────────────────────────────────────────────────
  // @upstash/redis automatically deserializes JSON, so `cached` is already
  // a plain object here — do not JSON.parse it.
  const cached = await redis.get(cacheKey(userId))
  if (cached) {
    return NextResponse.json(cached, { headers })
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

  await redis.set(cacheKey(userId), payload, { ex: CACHE_TTL_SECONDS })

  return NextResponse.json(payload, { headers })
}