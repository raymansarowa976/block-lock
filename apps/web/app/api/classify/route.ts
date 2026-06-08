import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { rateLimit } from "@/lib/rate-limit"
import { ClassifyDomainRequestSchema } from "@block-lock/shared-types"
import { classifyDomain } from "@/lib/classification/classify-domain"

// Internal endpoint: the extension calls this when it encounters a domain that
// doesn't match any of the user's existing rules ("unclassified"), so the
// semantic engine can decide whether it looks like a known distraction.
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

  const parsed = ClassifyDomainRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const result = await classifyDomain(userId, parsed.data.domain)
    return NextResponse.json(result, { status: 200 })
  } catch {
    return NextResponse.json({ error: "Failed to classify domain" }, { status: 502 })
  }
}
