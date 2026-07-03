import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { corsHeaders, handleCorsPreflight } from "@/lib/cors"
import { AnalyticsBatchSchema } from "@block-lock/shared-types"
import { NextResponse } from "next/server"

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request)
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin")) ?? undefined

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }

  const userId = session.user.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400, headers })
  }

  const parsed = AnalyticsBatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad Request", details: parsed.error.flatten() },
      { status: 400, headers },
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

  return NextResponse.json({ count }, { status: 201, headers })
}
