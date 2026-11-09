import { corsHeaders, handleCorsPreflight } from "@/lib/cors"
import { mintSyncRefreshToken, mintSyncToken, verifySyncRefreshToken } from "@/lib/sync-token"
import { rateLimit } from "@/lib/rate-limit"
import { NextResponse } from "next/server"

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request)
}

// Lets the extension renew its 15-minute access token on its own, so rule
// changes keep syncing after the dashboard tab that originally bound it is
// closed. Authenticates via the refresh token (the extension has no
// dashboard session), which is rotated on every call. A sign-out revokes
// refresh tokens along with access tokens (see lib/sync-token.ts), after
// which this returns 401 and the extension falls back to session_expired.
//
// The refresh token travels in the body rather than the query string, so the
// long-lived credential stays out of request logs.
export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin")) ?? undefined

  let refreshToken: unknown
  try {
    ;({ refreshToken } = await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400, headers })
  }
  if (typeof refreshToken !== "string" || !refreshToken) {
    return NextResponse.json({ error: "Missing refreshToken" }, { status: 400, headers })
  }

  const verified = await verifySyncRefreshToken(refreshToken)
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }
  const userId = verified.userId

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

  const { token, expiresAt } = mintSyncToken(userId)
  const rotated = mintSyncRefreshToken(userId)
  return NextResponse.json({ token, expiresAt, refreshToken: rotated.refreshToken }, { headers })
}
