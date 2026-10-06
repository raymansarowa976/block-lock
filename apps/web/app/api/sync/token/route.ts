import { auth } from "@/auth"
import { mintSyncToken } from "@/lib/sync-token"
import { NextResponse } from "next/server"

// Mints the short-lived credential the dashboard hands the extension over
// BLOCK_LOCK_AUTH in place of a bare userId. Only reachable with a live
// dashboard session, so the resulting token is provably tied to an
// authenticated user rather than a guessable cuid.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { token, expiresAt } = mintSyncToken(session.user.id)
  return NextResponse.json({ token, expiresAt })
}
