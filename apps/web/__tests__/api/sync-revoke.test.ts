import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/lib/sync-token", () => ({
  decodeVerifiedPayload: vi.fn(),
  revokeSyncTokensFor: vi.fn(),
}))

import { decodeVerifiedPayload, revokeSyncTokensFor } from "@/lib/sync-token"
import { POST, OPTIONS } from "@/app/api/sync/revoke/route"

const mockDecode = decodeVerifiedPayload as unknown as Mock
const mockRevoke = revokeSyncTokensFor as unknown as Mock

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const VALID_TOKEN = "valid.token"

const EXTENSION_ID = "ldlmnamnojhcjjnfoodglmcnaedagljl"
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

function revokeRequest(token?: string, origin?: string) {
  const url = token
    ? `http://localhost/api/sync/revoke?token=${token}`
    : "http://localhost/api/sync/revoke"
  const headers = new Headers()
  if (origin) headers.set("origin", origin)
  return new Request(url, { method: "POST", headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_EXTENSION_ID = EXTENSION_ID
  mockRevoke.mockResolvedValue(undefined)
  mockDecode.mockImplementation((token: string) =>
    token === VALID_TOKEN ? { userId: USER_ID } : null,
  )
})

describe("POST /api/sync/revoke", () => {
  it("returns 400 when the token query param is absent", async () => {
    const res = await POST(revokeRequest())
    expect(res.status).toBe(400)
  })

  it("does not revoke anything when the token is missing", async () => {
    await POST(revokeRequest())
    expect(mockRevoke).not.toHaveBeenCalled()
  })

  it("returns 401 when the token fails verification", async () => {
    const res = await POST(revokeRequest("garbage"))
    expect(res.status).toBe(401)
  })

  it("does not revoke anything when the token is invalid", async () => {
    await POST(revokeRequest("garbage"))
    expect(mockRevoke).not.toHaveBeenCalled()
  })

  it("revokes tokens for the userId decoded from a valid token", async () => {
    await POST(revokeRequest(VALID_TOKEN))
    expect(mockRevoke).toHaveBeenCalledWith(USER_ID)
  })

  it("returns 200 with { revoked: true } on success", async () => {
    const res = await POST(revokeRequest(VALID_TOKEN))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ revoked: true })
  })

  it("accepts an already-revoked (but still signature-valid) token without erroring", async () => {
    // Two sign-outs firing in quick succession must both succeed harmlessly.
    const res = await POST(revokeRequest(VALID_TOKEN))
    expect(res.status).toBe(200)
    expect(mockRevoke).toHaveBeenCalledWith(USER_ID)
  })

  describe("CORS — extension origin handling", () => {
    it("echoes the extension origin in Access-Control-Allow-Origin", async () => {
      const res = await POST(revokeRequest(VALID_TOKEN, EXTENSION_ORIGIN))
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
    })

    it("does not set Access-Control-Allow-Origin for an unrelated origin", async () => {
      const res = await POST(revokeRequest(VALID_TOKEN, "https://evil.com"))
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
    })

    it("sets CORS headers on a 401 response too", async () => {
      const res = await POST(revokeRequest("garbage", EXTENSION_ORIGIN))
      expect(res.status).toBe(401)
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
    })

    it("responds to an OPTIONS preflight from the extension origin with 204 and CORS headers", async () => {
      const headers = new Headers()
      headers.set("origin", EXTENSION_ORIGIN)
      const res = await OPTIONS(
        new Request("http://localhost/api/sync/revoke", { method: "OPTIONS", headers }),
      )
      expect(res.status).toBe(204)
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
    })
  })
})
