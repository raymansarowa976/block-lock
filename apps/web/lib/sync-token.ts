import { createHmac, timingSafeEqual } from "crypto"

// Short-lived credential the extension presents to /api/sync in place of a
// bare userId. Minted server-side from an authenticated dashboard session
// (see app/api/sync/token/route.ts) so a leaked/curled value can't be reused
// forever and expires on its own without needing revocation.
export const SYNC_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

interface SyncTokenPayload {
  sub: string
  exp: number
}

function sign(payload: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("base64url")
}

export function mintSyncToken(
  userId: string,
  now: number = Date.now(),
): { token: string; expiresAt: number } {
  const expiresAt = now + SYNC_TOKEN_TTL_MS
  const payload: SyncTokenPayload = { sub: userId, exp: expiresAt }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const token = `${encodedPayload}.${sign(encodedPayload)}`
  return { token, expiresAt }
}

function parseToken(token: string): { encodedPayload: string; signature: string } | null {
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [encodedPayload, signature] = parts
  return { encodedPayload, signature }
}

function hasValidSignature(encodedPayload: string, signature: string): boolean {
  const provided = Buffer.from(signature)
  const expected = Buffer.from(sign(encodedPayload))
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

function decodePayload(encodedPayload: string): SyncTokenPayload | null {
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null
    return payload
  } catch {
    return null
  }
}

export function verifySyncToken(
  token: string,
  now: number = Date.now(),
): { userId: string } | null {
  const parsed = parseToken(token)
  if (!parsed) return null
  if (!hasValidSignature(parsed.encodedPayload, parsed.signature)) return null

  const payload = decodePayload(parsed.encodedPayload)
  if (!payload) return null
  if (now >= payload.exp) return null

  return { userId: payload.sub }
}
