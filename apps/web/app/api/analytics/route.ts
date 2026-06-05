import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { AnalyticsBatchSchema } from "@block-lock/shared-types"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 })
  }

  const parsed = AnalyticsBatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad Request", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { count } = await prisma.usageLog.createMany({
    data: parsed.data.entries.map((entry) => ({
      userId,
      domain: entry.domain,
      duration: entry.duration,
      timeLimitId: null,
      blockedAt: null,
    })),
  })

  return NextResponse.json({ count }, { status: 201 })
}
