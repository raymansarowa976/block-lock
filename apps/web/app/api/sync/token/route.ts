import { auth } from "@/auth"
import { mintSyncRefreshToken, mintSyncToken } from "@/lib/sync-token"
import { NextResponse } from "next/server"

// Mints the credentials the dashboard hands the extension over
// BLOCK_LOCK_AUTH in place of a bare userId. Only reachable with a live
// dashboard session, so the resulting tokens are provably tied to an
// authenticated user rather than a guessable cuid. The refresh token lets
// the extension renew its short-lived access token by itself (see
// app/api/sync/refresh/route.ts) after the dashboard tab is closed.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { token, expiresAt } = mintSyncToken(session.user.id)
  const { refreshToken } = mintSyncRefreshToken(session.user.id)
  return NextResponse.json({ token, expiresAt, refreshToken })
}
