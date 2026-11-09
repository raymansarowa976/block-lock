import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/lib/sync-token", () => ({
  verifySyncRefreshToken: vi.fn(),
  mintSyncToken: vi.fn(),
  mintSyncRefreshToken: vi.fn(),
}))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }))

import { verifySyncRefreshToken, mintSyncToken, mintSyncRefreshToken } from "@/lib/sync-token"
import { rateLimit } from "@/lib/rate-limit"
import { POST, OPTIONS } from "@/app/api/sync/refresh/route"

const mockVerify = verifySyncRefreshToken as unknown as Mock
const mockMint = mintSyncToken as unknown as Mock
const mockMintRefresh = mintSyncRefreshToken as unknown as Mock
const mockRateLimit = rateLimit as unknown as Mock

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const VALID_REFRESH = "valid.refresh"

const EXTENSION_ID = "ldlmnamnojhcjjnfoodglmcnaedagljl"
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

function refreshRequest(body: unknown, origin?: string) {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (origin) headers.set("origin", origin)
  return new Request("http://localhost/api/sync/refresh", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_EXTENSION_ID = EXTENSION_ID
  mockVerify.mockImplementation(async (token: string) =>
    token === VALID_REFRESH ? { userId: USER_ID } : null,
  )
  mockMint.mockReturnValue({ token: "new.access", expiresAt: 123 })
  mockMintRefresh.mockReturnValue({ refreshToken: "new.refresh", refreshExpiresAt: 456 })
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 })
})

describe("POST /api/sync/refresh", () => {
  it("returns 400 when the body has no refreshToken", async () => {
    const res = await POST(refreshRequest({}))
    expect(res.status).toBe(400)
  })

  it("returns 400 when the body is not valid JSON", async () => {
    const res = await POST(refreshRequest("not json"))
    expect(res.status).toBe(400)
  })

  it("returns 401 and mints nothing when the refresh token fails verification", async () => {
    const res = await POST(refreshRequest({ refreshToken: "garbage" }))
    expect(res.status).toBe(401)
    expect(mockMint).not.toHaveBeenCalled()
    expect(mockMintRefresh).not.toHaveBeenCalled()
  })

  it("mints a new access token and a rotated refresh token for the verified user", async () => {
    const res = await POST(refreshRequest({ refreshToken: VALID_REFRESH }))
    expect(res.status).toBe(200)
    expect(mockMint).toHaveBeenCalledWith(USER_ID)
    expect(mockMintRefresh).toHaveBeenCalledWith(USER_ID)
    expect(await res.json()).toEqual({
      token: "new.access",
      expiresAt: 123,
      refreshToken: "new.refresh",
    })
  })

  it("returns 429 and mints nothing when the user is over the rate limit", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 })
    const res = await POST(refreshRequest({ refreshToken: VALID_REFRESH }))
    expect(res.status).toBe(429)
    expect(mockRateLimit).toHaveBeenCalledWith(USER_ID)
    expect(mockMint).not.toHaveBeenCalled()
  })

  describe("CORS — extension origin handling", () => {
    it("echoes the extension origin in Access-Control-Allow-Origin", async () => {
      const res = await POST(refreshRequest({ refreshToken: VALID_REFRESH }, EXTENSION_ORIGIN))
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
    })

    it("sets CORS headers on a 401 response too", async () => {
      const res = await POST(refreshRequest({ refreshToken: "garbage" }, EXTENSION_ORIGIN))
      expect(res.status).toBe(401)
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
    })

    it("does not set Access-Control-Allow-Origin for an unrelated origin", async () => {
      const res = await POST(refreshRequest({ refreshToken: VALID_REFRESH }, "https://evil.com"))
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
    })

    it("responds to an OPTIONS preflight from the extension origin with 204", async () => {
      const headers = new Headers({ origin: EXTENSION_ORIGIN })
      const res = await OPTIONS(
        new Request("http://localhost/api/sync/refresh", { method: "OPTIONS", headers }),
      )
      expect(res.status).toBe(204)
    })
  })
})
