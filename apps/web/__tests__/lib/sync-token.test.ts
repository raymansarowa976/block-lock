import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}))

import { redis } from "@/lib/redis"
import {
  mintSyncToken,
  verifySyncToken,
  revokeSyncTokensFor,
  decodeVerifiedPayload,
  SYNC_TOKEN_TTL_MS,
} from "@/lib/sync-token"

const mockGet = redis.get as unknown as Mock
const mockSet = redis.set as unknown as Mock

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-do-not-use-in-prod"
  vi.clearAllMocks()
  mockGet.mockResolvedValue(null) // not revoked, by default
})

describe("mintSyncToken", () => {
  it("returns a non-empty token string", () => {
    const { token } = mintSyncToken(USER_ID)
    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(0)
  })

  it("returns an expiresAt timestamp TTL milliseconds in the future", () => {
    const now = Date.now()
    const { expiresAt } = mintSyncToken(USER_ID, now)
    expect(expiresAt).toBe(now + SYNC_TOKEN_TTL_MS)
  })

  it("mints different tokens for different users", () => {
    const a = mintSyncToken(USER_ID)
    const b = mintSyncToken("clh3q5g0o0009qmij2z3m4n5k")
    expect(a.token).not.toBe(b.token)
  })
})

describe("verifySyncToken", () => {
  it("recovers the original userId from a freshly minted token", async () => {
    const { token } = mintSyncToken(USER_ID)
    const result = await verifySyncToken(token)
    expect(result).toEqual({ userId: USER_ID })
  })

  it("rejects a token past its expiry", async () => {
    const now = Date.now()
    const { token } = mintSyncToken(USER_ID, now)
    const result = await verifySyncToken(token, now + SYNC_TOKEN_TTL_MS + 1)
    expect(result).toBeNull()
  })

  it("accepts a token right up to (but not at) its expiry boundary", async () => {
    const now = Date.now()
    const { token, expiresAt } = mintSyncToken(USER_ID, now)
    const result = await verifySyncToken(token, expiresAt - 1)
    expect(result).toEqual({ userId: USER_ID })
  })

  it("rejects a token whose payload has been tampered with", async () => {
    const { token } = mintSyncToken(USER_ID)
    const [payload, signature] = token.split(".")
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "someone-else", iat: Date.now(), exp: Date.now() + SYNC_TOKEN_TTL_MS }),
    ).toString("base64url")
    void payload
    const tampered = `${tamperedPayload}.${signature}`
    expect(await verifySyncToken(tampered)).toBeNull()
  })

  it("rejects a token signed with a different secret", async () => {
    const { token } = mintSyncToken(USER_ID)
    process.env.AUTH_SECRET = "a-completely-different-secret"
    expect(await verifySyncToken(token)).toBeNull()
  })

  it("rejects malformed input that isn't a payload.signature pair", async () => {
    expect(await verifySyncToken("not-a-valid-token")).toBeNull()
  })

  it("rejects an empty string", async () => {
    expect(await verifySyncToken("")).toBeNull()
  })

  it("rejects a token whose decoded payload is not valid JSON", async () => {
    const bogusPayload = Buffer.from("not json").toString("base64url")
    expect(await verifySyncToken(`${bogusPayload}.somesignature`)).toBeNull()
  })

  it("does not consult the revocation store when the signature is invalid", async () => {
    await verifySyncToken("garbage.signature")
    expect(mockGet).not.toHaveBeenCalled()
  })

  it("checks the revocation cutoff under a key scoped to the token's userId", async () => {
    const { token } = mintSyncToken(USER_ID)
    await verifySyncToken(token)
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(USER_ID))
  })
})

// ---------------------------------------------------------------------------
// verifySyncToken – revocation (sign-out invalidates outstanding tokens)
// ---------------------------------------------------------------------------

describe("verifySyncToken – revocation", () => {
  it("rejects a token minted before the stored revocation cutoff", async () => {
    const now = Date.now()
    const { token } = mintSyncToken(USER_ID, now)
    mockGet.mockResolvedValue(now + 1)
    const result = await verifySyncToken(token, now + 2)
    expect(result).toBeNull()
  })

  it("rejects a token minted at the exact revocation cutoff", async () => {
    const now = Date.now()
    const { token } = mintSyncToken(USER_ID, now)
    mockGet.mockResolvedValue(now)
    const result = await verifySyncToken(token, now + 1)
    expect(result).toBeNull()
  })

  it("accepts a token minted after the stored revocation cutoff", async () => {
    const now = Date.now()
    mockGet.mockResolvedValue(now - 1)
    const { token } = mintSyncToken(USER_ID, now)
    const result = await verifySyncToken(token, now + 10)
    expect(result).toEqual({ userId: USER_ID })
  })

  it("accepts the token when no revocation cutoff is stored for the user", async () => {
    mockGet.mockResolvedValue(null)
    const { token } = mintSyncToken(USER_ID)
    const result = await verifySyncToken(token)
    expect(result).toEqual({ userId: USER_ID })
  })
})

// ---------------------------------------------------------------------------
// decodeVerifiedPayload – pure signature/expiry check, no revocation lookup
// (used by the revoke endpoint to recover a token's owner)
// ---------------------------------------------------------------------------

describe("decodeVerifiedPayload", () => {
  it("recovers the userId without consulting the revocation store", () => {
    const { token } = mintSyncToken(USER_ID)
    expect(decodeVerifiedPayload(token)).toEqual({ userId: USER_ID })
    expect(mockGet).not.toHaveBeenCalled()
  })

  it("recovers the userId even from a token that is already revoked", () => {
    // The revoke endpoint must be able to identify who a token belongs to
    // even when it's the very token being revoked right now.
    const { token } = mintSyncToken(USER_ID)
    expect(decodeVerifiedPayload(token)).toEqual({ userId: USER_ID })
  })

  it("returns null for an expired token", () => {
    const now = Date.now()
    const { token, expiresAt } = mintSyncToken(USER_ID, now)
    expect(decodeVerifiedPayload(token, expiresAt)).toBeNull()
  })

  it("returns null for a tampered token", () => {
    const { token } = mintSyncToken(USER_ID)
    const [, signature] = token.split(".")
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "someone-else", iat: Date.now(), exp: Date.now() + SYNC_TOKEN_TTL_MS }),
    ).toString("base64url")
    expect(decodeVerifiedPayload(`${tamperedPayload}.${signature}`)).toBeNull()
  })

  it("returns null for malformed input", () => {
    expect(decodeVerifiedPayload("not-a-valid-token")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// revokeSyncTokensFor – records the per-user revocation cutoff
// ---------------------------------------------------------------------------

describe("revokeSyncTokensFor", () => {
  it("writes the revocation cutoff under a key scoped to the userId", async () => {
    await revokeSyncTokensFor(USER_ID)
    expect(mockSet.mock.calls[0][0]).toContain(USER_ID)
  })

  it("stores the provided cutoff timestamp as the value", async () => {
    const now = Date.now()
    await revokeSyncTokensFor(USER_ID, now)
    expect(mockSet.mock.calls[0][1]).toBe(now)
  })

  it("defaults the cutoff to the current time", async () => {
    const before = Date.now()
    await revokeSyncTokensFor(USER_ID)
    const after = Date.now()
    const cutoff = mockSet.mock.calls[0][1] as number
    expect(cutoff).toBeGreaterThanOrEqual(before)
    expect(cutoff).toBeLessThanOrEqual(after)
  })

  it("sets a TTL matching the token lifetime, in seconds", async () => {
    await revokeSyncTokensFor(USER_ID)
    const [, , opts] = mockSet.mock.calls[0]
    expect(opts.ex).toBe(Math.ceil(SYNC_TOKEN_TTL_MS / 1000))
  })

  it("a token minted before revocation is rejected by verifySyncToken immediately after", async () => {
    const now = Date.now()
    const { token } = mintSyncToken(USER_ID, now)

    let storedCutoff: number | null = null
    mockSet.mockImplementation((_key: string, value: number) => {
      storedCutoff = value
      return Promise.resolve("OK")
    })
    mockGet.mockImplementation(() => Promise.resolve(storedCutoff))

    await revokeSyncTokensFor(USER_ID, now + 5)
    const result = await verifySyncToken(token, now + 10)
    expect(result).toBeNull()
  })
})
