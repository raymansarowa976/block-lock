import { createHmac, timingSafeEqual } from "crypto"
import { redis } from "@/lib/redis"

// Short-lived credential the extension presents to /api/sync and
// /api/analytics in place of a bare userId. Minted server-side from an
// authenticated dashboard session (see app/api/sync/token/route.ts) so a
// leaked/curled value can't be replayed forever — and, since it also expires
// on its own, a sign-out only needs to block tokens issued before it rather
// than track every individual token ever minted.
export const SYNC_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

// Long-lived credential the extension trades in at /api/sync/refresh for a
// new access token once no dashboard tab is open to re-mint one for it.
// Every refresh also rotates it, so an extension that keeps syncing stays
// connected indefinitely; only one left idle for this long has to re-login.
export const SYNC_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

type SyncTokenType = "access" | "refresh"

interface SyncTokenPayload {
  sub: string
  iat: number
  exp: number
  // Absent on access tokens minted before refresh tokens existed — those
  // are treated as access tokens.
  typ?: SyncTokenType
}

function sign(payload: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("base64url")
}

function mint(userId: string, typ: SyncTokenType, ttlMs: number, now: number) {
  const expiresAt = now + ttlMs
  const payload: SyncTokenPayload = { sub: userId, iat: now, exp: expiresAt, typ }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return { token: `${encodedPayload}.${sign(encodedPayload)}`, expiresAt }
}

export function mintSyncToken(
  userId: string,
  now: number = Date.now(),
): { token: string; expiresAt: number } {
  return mint(userId, "access", SYNC_TOKEN_TTL_MS, now)
}

export function mintSyncRefreshToken(
  userId: string,
  now: number = Date.now(),
): { refreshToken: string; refreshExpiresAt: number } {
  const { token, expiresAt } = mint(userId, "refresh", SYNC_REFRESH_TOKEN_TTL_MS, now)
  return { refreshToken: token, refreshExpiresAt: expiresAt }
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

function tokenType(payload: SyncTokenPayload): SyncTokenType {
  return payload.typ === "refresh" ? "refresh" : "access"
}

// Signature + expiry check, any token type.
function decodeUnexpired(token: string, now: number): SyncTokenPayload | null {
  const parsed = parseToken(token)
  if (!parsed) return null
  if (!hasValidSignature(parsed.encodedPayload, parsed.signature)) return null

  const payload = decodePayload(parsed.encodedPayload)
  if (!payload) return null
  if (now >= payload.exp) return null

  return payload
}

// Pure signature + expiry check — no I/O, so it can't tell a revoked token
// from a live one. Exported for the revoke endpoint, which needs to recover
// a token's userId even when the token may already be revoked (e.g. two
// sign-outs in quick succession). Accepts either token type, so the
// extension can still revoke with its refresh token after its access token
// has lapsed.
export function decodeVerifiedPayload(
  token: string,
  now: number = Date.now(),
): { userId: string } | null {
  const payload = decodeUnexpired(token, now)
  return payload ? { userId: payload.sub } : null
}

function revocationKey(userId: string) {
  return `sync-token:revoked-before:${userId}`
}

async function verifyTyped(
  token: string,
  typ: SyncTokenType,
  now: number,
): Promise<{ userId: string } | null> {
  const payload = decodeUnexpired(token, now)
  if (!payload) return null
  // A refresh token must never work as a 30-day access token, and an access
  // token must never be able to extend itself.
  if (tokenType(payload) !== typ) return null

  const revokedAt = await redis.get<number>(revocationKey(payload.sub))
  if (typeof revokedAt === "number" && payload.iat <= revokedAt) return null

  return { userId: payload.sub }
}

export function verifySyncToken(
  token: string,
  now: number = Date.now(),
): Promise<{ userId: string } | null> {
  return verifyTyped(token, "access", now)
}

export function verifySyncRefreshToken(
  token: string,
  now: number = Date.now(),
): Promise<{ userId: string } | null> {
  return verifyTyped(token, "refresh", now)
}

// Invalidates every sync token — access and refresh — issued for this user
// up to `now`, e.g. on sign-out. Tokens are stateless and self-verifying, so
// there's no row to delete for "the" token — instead we record a per-user
// cutoff and reject anything minted before it. The TTL only needs to cover
// the longest a pre-cutoff token could otherwise still pass its own expiry
// check, which is the refresh token's lifetime.
export async function revokeSyncTokensFor(userId: string, now: number = Date.now()): Promise<void> {
  await redis.set(revocationKey(userId), now, { ex: Math.ceil(SYNC_REFRESH_TOKEN_TTL_MS / 1000) })
}
