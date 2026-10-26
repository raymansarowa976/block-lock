import { describe, it, expect, vi, beforeEach } from "vitest"
import { getAccessToken, TOKEN_RENEW_SKEW_MS } from "../src/sync-credential"

const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()
const mockFetch = vi.fn()

vi.stubGlobal("chrome", {
  storage: { local: { get: mockStorageGet, set: mockStorageSet } },
})
vi.stubGlobal("fetch", mockFetch)

const EXPIRED_CREDENTIAL = {
  authError: "session_expired",
  userId: null,
  token: null,
  tokenExpiresAt: null,
  refreshToken: null,
}

function refreshResponse(body = { token: "new.tok", expiresAt: 123_456, refreshToken: "new.refresh" }) {
  return { ok: true, status: 200, json: async () => body }
}

beforeEach(() => {
  mockStorageGet.mockReset().mockResolvedValue({})
  mockStorageSet.mockReset().mockResolvedValue(undefined)
  mockFetch.mockReset()
})

describe("getAccessToken – stored token still valid", () => {
  it("reports no credential when nothing is stored", async () => {
    expect(await getAccessToken()).toEqual({ status: "none" })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns the stored token without a network call while it has time left", async () => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() + TOKEN_RENEW_SKEW_MS + 60_000,
      refreshToken: "signed.refresh",
    })
    expect(await getAccessToken()).toEqual({ status: "ok", token: "signed.tok" })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("keeps using a token close to expiry when there is no refresh token to renew it with", async () => {
    // Extensions bound by a dashboard that predates refresh tokens.
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 1_000 })
    expect(await getAccessToken()).toEqual({ status: "ok", token: "signed.tok" })
  })
})

describe("getAccessToken – renewing with the refresh token", () => {
  it("renews an expired access token via /api/sync/refresh, sending the refresh token in the body", async () => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() - 1,
      refreshToken: "signed.refresh",
    })
    mockFetch.mockResolvedValue(refreshResponse())

    expect(await getAccessToken()).toEqual({ status: "ok", token: "new.tok" })

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toMatch(/\/api\/sync\/refresh$/)
    expect(opts.method).toBe("POST")
    expect(opts.headers["Content-Type"]).toBe("application/json")
    expect(JSON.parse(opts.body)).toEqual({ refreshToken: "signed.refresh" })
  })

  it("renews a token that is within the skew window of expiring, before it can lapse mid-request", async () => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() + TOKEN_RENEW_SKEW_MS - 1_000,
      refreshToken: "signed.refresh",
    })
    mockFetch.mockResolvedValue(refreshResponse())
    expect(await getAccessToken()).toEqual({ status: "ok", token: "new.tok" })
  })

  it("renews when only a refresh token is stored", async () => {
    mockStorageGet.mockResolvedValue({ refreshToken: "signed.refresh" })
    mockFetch.mockResolvedValue(refreshResponse())
    expect(await getAccessToken()).toEqual({ status: "ok", token: "new.tok" })
  })

  it("stores the new access token, its expiry, and the rotated refresh token", async () => {
    mockStorageGet.mockResolvedValue({ tokenExpiresAt: Date.now() - 1, token: "t", refreshToken: "signed.refresh" })
    mockFetch.mockResolvedValue(refreshResponse())
    await getAccessToken()
    expect(mockStorageSet).toHaveBeenCalledWith({
      token: "new.tok",
      tokenExpiresAt: 123_456,
      refreshToken: "new.refresh",
      authError: null,
    })
  })

  it("expires the session when the server rejects the refresh token (e.g. after a sign-out)", async () => {
    mockStorageGet.mockResolvedValue({ token: "t", tokenExpiresAt: Date.now() - 1, refreshToken: "signed.refresh" })
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    expect(await getAccessToken()).toEqual({ status: "expired" })
    expect(mockStorageSet).toHaveBeenCalledWith(EXPIRED_CREDENTIAL)
  })

  it("keeps the credential and reports a network error when the refresh call can't reach the server", async () => {
    mockStorageGet.mockResolvedValue({ token: "t", tokenExpiresAt: Date.now() - 1, refreshToken: "signed.refresh" })
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"))
    expect(await getAccessToken()).toEqual({ status: "error", error: "network" })
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("keeps the credential and reports a server error on a non-auth refresh failure", async () => {
    mockStorageGet.mockResolvedValue({ token: "t", tokenExpiresAt: Date.now() - 1, refreshToken: "signed.refresh" })
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    expect(await getAccessToken()).toEqual({ status: "error", error: "server" })
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("keeps the credential on a 429 from the refresh endpoint rather than signing the user out", async () => {
    mockStorageGet.mockResolvedValue({ token: "t", tokenExpiresAt: Date.now() - 1, refreshToken: "signed.refresh" })
    mockFetch.mockResolvedValue({ ok: false, status: 429 })
    expect(await getAccessToken()).toEqual({ status: "error", error: "server" })
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})

describe("getAccessToken – expired with no way to renew", () => {
  it("expires the session locally, without a network call", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() - 1 })
    expect(await getAccessToken()).toEqual({ status: "expired" })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockStorageSet).toHaveBeenCalledWith(EXPIRED_CREDENTIAL)
  })
})
