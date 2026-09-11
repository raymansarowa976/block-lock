import { describe, it, expect, vi, beforeEach } from "vitest"
import { handleExternalMessage, syncRules } from "../src/auth-handler"

const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
})

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

beforeEach(() => {
  // chrome.storage.local.get() always resolves to an object in the real runtime
  mockStorageGet.mockReset().mockResolvedValue({})
  mockStorageSet.mockReset().mockResolvedValue(undefined)
  mockFetch.mockReset()
})

// ---------------------------------------------------------------------------
// handleExternalMessage
// ---------------------------------------------------------------------------

describe("handleExternalMessage – origin validation", () => {
  it("responds with forbidden when the sender URL is not an allowed origin", async () => {
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-123", token: "tok", expiresAt: 1 },
      { url: "https://evil.com/page" },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "forbidden" })
  })

  it("does not write to storage when the origin is disallowed", async () => {
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-123", token: "tok", expiresAt: 1 },
      { url: "https://evil.com/page" },
      vi.fn(),
    )
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("accepts messages from the production origin", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-123", token: "tok", expiresAt: 1 },
      { url: "https://blocklock.app/dashboard" },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it("rejects messages from the retired block-lock.vercel.app origin", async () => {
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-123", token: "tok", expiresAt: 1 },
      { url: "https://block-lock.vercel.app/dashboard" },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "forbidden" })
  })

  it("accepts messages from localhost during development", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-123", token: "tok", expiresAt: 1 },
      { url: "http://localhost:3000/dashboard" },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })
})

describe("handleExternalMessage – BLOCK_LOCK_AUTH", () => {
  const validSender = { url: "https://blocklock.app/dashboard" }

  it("stores userId, token and its expiry in chrome.storage.local", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-abc", token: "signed.tok", expiresAt: 999 },
      validSender,
      vi.fn(),
    )
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-abc",
        token: "signed.tok",
        tokenExpiresAt: 999,
      }),
    )
  })

  it("clears any previous authError when binding succeeds", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-abc", token: "signed.tok", expiresAt: 999 },
      validSender,
      vi.fn(),
    )
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ authError: null }),
    )
  })

  it("responds with { ok: true } on success", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-abc", token: "signed.tok", expiresAt: 999 },
      validSender,
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it("no longer accepts a bare userId as a usable credential — a token is required", async () => {
    // Regression guard for the original bug: even if a caller only sends
    // userId (old message shape), syncRules must not be able to authenticate
    // with it since /api/sync now only accepts a signed token.
    mockStorageSet.mockResolvedValue(undefined)
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-abc", token: "signed.tok", expiresAt: 999 },
      validSender,
      vi.fn(),
    )
    const [storedState] = mockStorageSet.mock.calls[0]
    expect(storedState.token).toBeTruthy()
  })
})

describe("handleExternalMessage – BLOCK_LOCK_SIGNOUT", () => {
  const validSender = { url: "https://blocklock.app/dashboard" }

  it("clears userId, token, tokenExpiresAt, authError and lastSync from storage", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    await handleExternalMessage(
      { type: "BLOCK_LOCK_SIGNOUT" },
      validSender,
      vi.fn(),
    )
    expect(mockStorageSet).toHaveBeenCalledWith({
      userId: null,
      token: null,
      tokenExpiresAt: null,
      authError: null,
      lastSync: null,
    })
  })

  it("responds with { ok: true } on signout", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_SIGNOUT" },
      validSender,
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })
})

describe("handleExternalMessage – BLOCK_LOCK_RULES_UPDATED", () => {
  const validSender = { url: "https://blocklock.app/dashboard" }

  it("rejects rules-update broadcasts from disallowed origins", async () => {
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_RULES_UPDATED" },
      { url: "https://evil.com/page" },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "forbidden" })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("immediately triggers a rule re-sync instead of waiting for the next alarm", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await handleExternalMessage(
      { type: "BLOCK_LOCK_RULES_UPDATED" },
      validSender,
      vi.fn(),
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/sync?token=signed.tok"),
    )
  })

  it("responds with { ok: true } once the sync has been dispatched", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_RULES_UPDATED" },
      validSender,
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it("dispatches the sync broadcast to the background script within 200ms", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const start = performance.now()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_RULES_UPDATED" },
      validSender,
      vi.fn(),
    )
    expect(performance.now() - start).toBeLessThan(200)
    expect(mockFetch).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// syncRules
// ---------------------------------------------------------------------------

describe("syncRules – auth error handling", () => {
  it("does nothing when no token is stored", async () => {
    mockStorageGet.mockResolvedValue({})
    await syncRules()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("requests /api/sync with the stored token, not a bare userId", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await syncRules()
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/sync?token=signed.tok"))
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining("userId="))
  })

  it("sets authError and clears the credential when the API responds 401", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    await syncRules()
    expect(mockStorageSet).toHaveBeenCalledWith({
      authError: "session_expired",
      userId: null,
      token: null,
      tokenExpiresAt: null,
    })
  })

  it("sets authError and clears the credential when the API responds 403", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
    await syncRules()
    expect(mockStorageSet).toHaveBeenCalledWith({
      authError: "session_expired",
      userId: null,
      token: null,
      tokenExpiresAt: null,
    })
  })

  it("does not set authError for non-auth API failures (e.g. 500)", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await syncRules()
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("sets authError and clears the credential locally, without a network call, once the stored token's expiry has passed", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() - 1 })
    await syncRules()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockStorageSet).toHaveBeenCalledWith({
      authError: "session_expired",
      userId: null,
      token: null,
      tokenExpiresAt: null,
    })
  })
})
