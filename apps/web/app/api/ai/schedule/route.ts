import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { rateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { DEFAULT_DAILY_LIMIT_MINUTES } from "@/lib/constants"
import { AIScheduleParseRequestSchema, AIScheduleParseResultSchema } from "@block-lock/shared-types"
import { parseScheduleFromPrompt } from "@/lib/ai/schedule-parser"

// A schedule can never attach to an unconditionally-blocked (dailyLimit:
// null) TimeLimit — thrown inside the transaction to abort and roll back
// the whole batch of parsed blocks when one targets an already-blocked domain.
class BlockedDomainError extends Error {
  constructor(public domain: string) {
    super(`${domain} is already blocked`)
  }
}

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const rate = await rateLimit(userId)
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rate.remaining),
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
        },
      },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const parsedRequest = AIScheduleParseRequestSchema.safeParse(body)
  if (!parsedRequest.success) {
    return NextResponse.json(
      { success: false, error: parsedRequest.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  let modelOutput: unknown
  try {
    modelOutput = await parseScheduleFromPrompt(parsedRequest.data.prompt)
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to reach the model provider" },
      { status: 502 },
    )
  }

  const parsedResult = AIScheduleParseResultSchema.safeParse(modelOutput)
  if (!parsedResult.success) {
    return NextResponse.json(
      { success: false, error: "Model returned an invalid schedule structure" },
      { status: 502 },
    )
  }

  let created
  try {
    created = await prisma.$transaction(async (tx) => {
      const records = []
      for (const block of parsedResult.data.blocks) {
        const timeLimit = await tx.timeLimit.upsert({
          where: { userId_domain: { userId, domain: block.domain } },
          update: {},
          create: { userId, domain: block.domain, dailyLimit: DEFAULT_DAILY_LIMIT_MINUTES, isActive: true },
        })
        if (timeLimit.dailyLimit === null) {
          throw new BlockedDomainError(block.domain)
        }
        const schedule = await tx.schedule.create({
          data: {
            timeLimitId: timeLimit.id,
            startTime: block.startTime,
            endTime: block.endTime,
            daysOfWeek: block.daysOfWeek,
          },
        })
        records.push({ timeLimit, schedule })
      }
      return records
    })
  } catch (err) {
    if (err instanceof BlockedDomainError) {
      return NextResponse.json(
        { success: false, error: `Cannot schedule ${err.domain} — it is already blocked` },
        { status: 409 },
      )
    }
    throw err
  }

  await redis.del(`user:rules:${userId}`)
  revalidatePath("/dashboard")

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}