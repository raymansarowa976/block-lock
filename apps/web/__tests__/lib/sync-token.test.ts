import { describe, it, expect, beforeEach } from "vitest"
import { mintSyncToken, verifySyncToken, SYNC_TOKEN_TTL_MS } from "@/lib/sync-token"

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-do-not-use-in-prod"
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
  it("recovers the original userId from a freshly minted token", () => {
    const { token } = mintSyncToken(USER_ID)
    const result = verifySyncToken(token)
    expect(result).toEqual({ userId: USER_ID })
  })

  it("rejects a token past its expiry", () => {
    const now = Date.now()
    const { token } = mintSyncToken(USER_ID, now)
    const result = verifySyncToken(token, now + SYNC_TOKEN_TTL_MS + 1)
    expect(result).toBeNull()
  })

  it("accepts a token right up to (but not at) its expiry boundary", () => {
    const now = Date.now()
    const { token, expiresAt } = mintSyncToken(USER_ID, now)
    const result = verifySyncToken(token, expiresAt - 1)
    expect(result).toEqual({ userId: USER_ID })
  })

  it("rejects a token whose payload has been tampered with", () => {
    const { token } = mintSyncToken(USER_ID)
    const [payload, signature] = token.split(".")
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "someone-else", exp: Date.now() + SYNC_TOKEN_TTL_MS }),
    ).toString("base64url")
    const tampered = `${tamperedPayload}.${signature}`
    expect(verifySyncToken(tampered)).toBeNull()
  })

  it("rejects a token signed with a different secret", () => {
    const { token } = mintSyncToken(USER_ID)
    process.env.AUTH_SECRET = "a-completely-different-secret"
    expect(verifySyncToken(token)).toBeNull()
  })

  it("rejects malformed input that isn't a payload.signature pair", () => {
    expect(verifySyncToken("not-a-valid-token")).toBeNull()
  })

  it("rejects an empty string", () => {
    expect(verifySyncToken("")).toBeNull()
  })

  it("rejects a token whose decoded payload is not valid JSON", () => {
    const bogusPayload = Buffer.from("not json").toString("base64url")
    expect(verifySyncToken(`${bogusPayload}.somesignature`)).toBeNull()
  })
})
