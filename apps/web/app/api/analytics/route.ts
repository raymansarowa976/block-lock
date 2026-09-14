import { prisma } from "@/lib/prisma"
import { corsHeaders, handleCorsPreflight } from "@/lib/cors"
import { verifySyncToken } from "@/lib/sync-token"
import { AnalyticsBatchSchema } from "@block-lock/shared-types"
import { NextResponse } from "next/server"

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request)
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin")) ?? undefined
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400, headers })
  }

  // Same short-lived, signed credential /api/sync verifies (see
  // lib/sync-token.ts) — a chrome-extension:// service-worker fetch is
  // cross-site, so the dashboard's session cookie never reaches this route
  // and auth() would 401 on every flush.
  const verified = verifySyncToken(token)
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }
  const userId = verified.userId

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
