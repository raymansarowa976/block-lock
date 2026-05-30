import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { UsageEventSchema } from "@block-lock/shared-types"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  // Rate-limit check runs before any database access
  const { allowed, remaining, resetAt } = await rateLimit(userId)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(Math.floor(resetAt / 1000)),
          "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        },
      },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 })
  }

  const parsed = UsageEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad Request", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const log = await prisma.usageLog.create({
    data: {
      userId,
      timeLimitId: parsed.data.timeLimitId,
      domain: parsed.data.domain,
      duration: parsed.data.duration,
      blockedAt: parsed.data.blockedAt,
    },
  })

  return NextResponse.json({ success: true, data: log }, { status: 201 })
}