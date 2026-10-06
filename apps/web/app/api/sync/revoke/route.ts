import { corsHeaders, handleCorsPreflight } from "@/lib/cors"
import { decodeVerifiedPayload, revokeSyncTokensFor } from "@/lib/sync-token"
import { NextResponse } from "next/server"

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request)
}

// Lets the extension invalidate its own credential server-side when the user
// signs out locally (BLOCK_LOCK_SIGNOUT) — otherwise a copied/leaked token
// would keep authenticating against /api/sync and /api/analytics until it
// naturally expired. Authenticates via the token itself (the extension has
// no dashboard session), so a still-recognizable-but-already-revoked token
// is accepted here on purpose: revoking twice is harmless.
export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin")) ?? undefined
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400, headers })
  }

  const decoded = decodeVerifiedPayload(token)
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }

  await revokeSyncTokensFor(decoded.userId)

  return NextResponse.json({ revoked: true }, { status: 200, headers })
}
