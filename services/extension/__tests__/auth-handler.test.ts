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
      { type: "BLOCK_LOCK_AUTH", userId: "user-123" },
      { url: "https://evil.com/page" },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "forbidden" })
  })

  it("does not write to storage when the origin is disallowed", async () => {
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-123" },
      { url: "https://evil.com/page" },
      vi.fn(),
    )
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("accepts messages from the production origin", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-123" },
      { url: "https://block-lock.vercel.app/dashboard" },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it("accepts messages from localhost during development", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    const sendResponse = vi.fn()
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-123" },
      { url: "http://localhost:3000/dashboard" },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })
})

describe("handleExternalMessage – BLOCK_LOCK_AUTH", () => {
  const validSender = { url: "https://block-lock.vercel.app/dashboard" }

  it("stores userId in chrome.storage.local", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-abc" },
      validSender,
      vi.fn(),
    )
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-abc" }),
    )
  })

  it("clears any previous authError when binding succeeds", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-abc" },
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
      { type: "BLOCK_LOCK_AUTH", userId: "user-abc" },
      validSender,
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })
})

describe("handleExternalMessage – BLOCK_LOCK_SIGNOUT", () => {
  const validSender = { url: "https://block-lock.vercel.app/dashboard" }

  it("clears userId, authError and lastSync from storage", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    await handleExternalMessage(
      { type: "BLOCK_LOCK_SIGNOUT" },
      validSender,
      vi.fn(),
    )
    expect(mockStorageSet).toHaveBeenCalledWith({
      userId: null,
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

// ---------------------------------------------------------------------------
// syncRules
// ---------------------------------------------------------------------------

describe("syncRules – auth error handling", () => {
  it("does nothing when no userId is stored", async () => {
    mockStorageGet.mockResolvedValue({})
    await syncRules()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("sets authError and clears userId when the API responds 401", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc" })
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    await syncRules()
    expect(mockStorageSet).toHaveBeenCalledWith({
      authError: "session_expired",
      userId: null,
    })
  })

  it("sets authError and clears userId when the API responds 403", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc" })
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
    await syncRules()
    expect(mockStorageSet).toHaveBeenCalledWith({
      authError: "session_expired",
      userId: null,
    })
  })

  it("does not set authError for non-auth API failures (e.g. 500)", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc" })
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await syncRules()
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})