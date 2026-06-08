import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { rateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { AIScheduleParseRequestSchema, AIScheduleParseResultSchema } from "@block-lock/shared-types"
import { parseScheduleFromPrompt } from "@/lib/ai/schedule-parser"

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rate = await rateLimit(userId)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsedRequest = AIScheduleParseRequestSchema.safeParse(body)
  if (!parsedRequest.success) {
    return NextResponse.json({ error: parsedRequest.error.flatten().fieldErrors }, { status: 400 })
  }

  let modelOutput: unknown
  try {
    modelOutput = await parseScheduleFromPrompt(parsedRequest.data.prompt)
  } catch {
    return NextResponse.json({ error: "Failed to reach the model provider" }, { status: 502 })
  }

  const parsedResult = AIScheduleParseResultSchema.safeParse(modelOutput)
  if (!parsedResult.success) {
    return NextResponse.json({ error: "Model returned an invalid schedule structure" }, { status: 502 })
  }

  const created = await prisma.$transaction(async (tx) => {
    const records = []
    for (const block of parsedResult.data.blocks) {
      const timeLimit = await tx.timeLimit.upsert({
        where: { userId_domain: { userId, domain: block.domain } },
        update: {},
        create: { userId, domain: block.domain, dailyLimit: null, isActive: true },
      })
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

  await redis.del(`user:rules:${userId}`)
  revalidatePath("/dashboard")

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}