import { createHmac, timingSafeEqual } from "crypto"
import { redis } from "@/lib/redis"

// Short-lived credential the extension presents to /api/sync and
// /api/analytics in place of a bare userId. Minted server-side from an
// authenticated dashboard session (see app/api/sync/token/route.ts) so a
// leaked/curled value can't be replayed forever — and, since it also expires
// on its own, a sign-out only needs to block tokens issued before it rather
// than track every individual token ever minted.
export const SYNC_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

interface SyncTokenPayload {
  sub: string
  iat: number
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
  const payload: SyncTokenPayload = { sub: userId, iat: now, exp: expiresAt }
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
    if (
      typeof payload.sub !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

// Pure signature + expiry check — no I/O, so it can't tell a revoked token
// from a live one. Used internally by verifySyncToken, and exported for the
// revoke endpoint, which needs to recover a token's userId even when the
// token may already be revoked (e.g. two sign-outs in quick succession).
export function decodeVerifiedPayload(
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

function revocationKey(userId: string) {
  return `sync-token:revoked-before:${userId}`
}

export async function verifySyncToken(
  token: string,
  now: number = Date.now(),
): Promise<{ userId: string } | null> {
  const parsed = parseToken(token)
  if (!parsed) return null
  if (!hasValidSignature(parsed.encodedPayload, parsed.signature)) return null

  const payload = decodePayload(parsed.encodedPayload)
  if (!payload) return null
  if (now >= payload.exp) return null

  const revokedAt = await redis.get<number>(revocationKey(payload.sub))
  if (typeof revokedAt === "number" && payload.iat <= revokedAt) return null

  return { userId: payload.sub }
}

// Invalidates every sync token issued for this user up to `now`, e.g. on
// sign-out. Tokens are stateless and self-verifying, so there's no row to
// delete for "the" token — instead we record a per-user cutoff and reject
// anything minted before it. The TTL only needs to cover the longest a
// pre-cutoff token could otherwise still pass its own expiry check.
export async function revokeSyncTokensFor(userId: string, now: number = Date.now()): Promise<void> {
  await redis.set(revocationKey(userId), now, { ex: Math.ceil(SYNC_TOKEN_TTL_MS / 1000) })
}
