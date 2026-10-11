import { describe, it, expect, vi, beforeEach } from "vitest"
import { handleExternalMessage, handleInternalMessage, syncRules, SYNC_RETRY_ALARM } from "../src/auth-handler"
import { applyBlockRules } from "../src/rule-engine"

vi.mock("../src/rule-engine", () => ({ applyBlockRules: vi.fn() }))
const mockApplyBlockRules = vi.mocked(applyBlockRules)

const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()
const mockAlarmsCreate = vi.fn()
const mockAlarmsClear = vi.fn()

vi.stubGlobal("chrome", {
  runtime: { id: "own-extension-id" },
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
  alarms: {
    create: mockAlarmsCreate,
    clear: mockAlarmsClear,
  },
})

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

beforeEach(() => {
  // chrome.storage.local.get() always resolves to an object in the real runtime
  mockStorageGet.mockReset().mockResolvedValue({})
  mockStorageSet.mockReset().mockResolvedValue(undefined)
  mockFetch.mockReset()
  mockApplyBlockRules.mockReset().mockResolvedValue(undefined)
  mockAlarmsCreate.mockReset()
  mockAlarmsClear.mockReset().mockResolvedValue(true)
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

  it("clears any previous syncError when binding succeeds", async () => {
    mockStorageSet.mockResolvedValue(undefined)
    await handleExternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "user-abc", token: "signed.tok", expiresAt: 999 },
      validSender,
      vi.fn(),
    )
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ syncError: null, syncFailures: 0 }),
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

  it("clears userId, token, tokenExpiresAt, authError, lastSync and syncError from storage", async () => {
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
      syncError: null,
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

  // ── Server-side revocation ────────────────────────────────────────────────
  // A local-only sign-out leaves whatever credential the extension was
  // holding valid server-side until it naturally expires. Signing out must
  // also revoke it, the same way a dashboard sign-out does (see
  // apps/web/lib/auth-events.ts).

  describe("server-side token revocation", () => {
    it("calls /api/sync/revoke with the stored token before clearing storage", async () => {
      mockStorageGet.mockResolvedValue({ token: "signed.tok" })
      mockFetch.mockResolvedValue({ ok: true, status: 200 })
      await handleExternalMessage({ type: "BLOCK_LOCK_SIGNOUT" }, validSender, vi.fn())
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sync/revoke?token=signed.tok"),
        expect.objectContaining({ method: "POST" }),
      )
    })

    it("does not call fetch when there is no stored token to revoke", async () => {
      mockStorageGet.mockResolvedValue({})
      await handleExternalMessage({ type: "BLOCK_LOCK_SIGNOUT" }, validSender, vi.fn())
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("still clears local storage and responds ok when the revoke call fails", async () => {
      mockStorageGet.mockResolvedValue({ token: "signed.tok" })
      mockFetch.mockRejectedValue(new Error("network failure"))
      const sendResponse = vi.fn()
      await handleExternalMessage({ type: "BLOCK_LOCK_SIGNOUT" }, validSender, sendResponse)
      expect(mockStorageSet).toHaveBeenCalledWith({
        userId: null,
        token: null,
        tokenExpiresAt: null,
        authError: null,
        lastSync: null,
        syncError: null,
      })
      expect(sendResponse).toHaveBeenCalledWith({ ok: true })
    })

    it("still clears local storage when the server rejects the revoke call", async () => {
      mockStorageGet.mockResolvedValue({ token: "signed.tok" })
      mockFetch.mockResolvedValue({ ok: false, status: 401 })
      await handleExternalMessage({ type: "BLOCK_LOCK_SIGNOUT" }, validSender, vi.fn())
      expect(mockStorageSet).toHaveBeenCalledWith({
        userId: null,
        token: null,
        tokenExpiresAt: null,
        authError: null,
        lastSync: null,
        syncError: null,
      })
    })
  })
})

// ---------------------------------------------------------------------------
// handleInternalMessage — the popup's local "Disconnect" fallback, for when
// the dashboard is unreachable and so can't send BLOCK_LOCK_SIGNOUT itself.
// ---------------------------------------------------------------------------

describe("handleInternalMessage – BLOCK_LOCK_SIGNOUT from the popup", () => {
  const popupSender = { id: "own-extension-id", url: "chrome-extension://own-extension-id/popup.html" }

  it("revokes the stored token server-side and clears local credentials", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok" })
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    const sendResponse = vi.fn()
    await handleInternalMessage({ type: "BLOCK_LOCK_SIGNOUT" }, popupSender, sendResponse)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/sync/revoke?token=signed.tok"),
      expect.objectContaining({ method: "POST" }),
    )
    expect(mockStorageSet).toHaveBeenCalledWith({
      userId: null,
      token: null,
      tokenExpiresAt: null,
      authError: null,
      lastSync: null,
      syncError: null,
    })
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it("still clears local credentials when the dashboard/API is unreachable", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok" })
    mockFetch.mockRejectedValue(new Error("network failure"))
    const sendResponse = vi.fn()
    await handleInternalMessage({ type: "BLOCK_LOCK_SIGNOUT" }, popupSender, sendResponse)
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, token: null }),
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it("rejects messages from another extension", async () => {
    const sendResponse = vi.fn()
    await handleInternalMessage({ type: "BLOCK_LOCK_SIGNOUT" }, { id: "other-extension" }, sendResponse)
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "forbidden" })
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("rejects messages sent from a tab context rather than an extension page", async () => {
    const sendResponse = vi.fn()
    await handleInternalMessage(
      { type: "BLOCK_LOCK_SIGNOUT" },
      { id: "own-extension-id", tab: { id: 1 } },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "forbidden" })
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("runs a sync immediately when the popup asks for one", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rules: [], schedules: [] }) })
    const sendResponse = vi.fn()
    await handleInternalMessage({ type: "BLOCK_LOCK_SYNC_NOW" }, popupSender, sendResponse)
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/sync?token=signed.tok"))
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it("rejects sync requests from a tab context", async () => {
    const sendResponse = vi.fn()
    await handleInternalMessage(
      { type: "BLOCK_LOCK_SYNC_NOW" },
      { id: "own-extension-id", tab: { id: 1 } },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "forbidden" })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("does not accept BLOCK_LOCK_AUTH internally — credentials only come from the dashboard", async () => {
    const sendResponse = vi.fn()
    await handleInternalMessage(
      { type: "BLOCK_LOCK_AUTH", userId: "u", token: "t", expiresAt: 1 } as never,
      popupSender,
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "unsupported" })
    expect(mockStorageSet).not.toHaveBeenCalled()
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
    expect(mockStorageSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ authError: expect.anything() }),
    )
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

// A failed sync used to leave no trace, so the popup sat on "Never synced"
// with no hint why. Each failure mode now records a syncError for the popup.
describe("syncRules – sync error reporting", () => {
  const validToken = () => ({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })

  it("records a network syncError when the API is unreachable, without throwing", async () => {
    mockStorageGet.mockResolvedValue(validToken())
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(syncRules()).resolves.toBeUndefined()
    expect(mockStorageSet).toHaveBeenCalledWith(expect.objectContaining({ syncError: "network" }))
    expect(mockApplyBlockRules).not.toHaveBeenCalled()
  })

  it("records a server syncError for non-auth API failures (e.g. 500)", async () => {
    mockStorageGet.mockResolvedValue(validToken())
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await syncRules()
    expect(mockStorageSet).toHaveBeenCalledWith(expect.objectContaining({ syncError: "server" }))
    expect(mockApplyBlockRules).not.toHaveBeenCalled()
  })

  it("records a rules syncError when the payload can't be applied, without throwing", async () => {
    mockStorageGet.mockResolvedValue(validToken())
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rules: [], schedules: [] }) })
    mockApplyBlockRules.mockRejectedValue(new Error("bad rule"))
    await expect(syncRules()).resolves.toBeUndefined()
    expect(mockStorageSet).toHaveBeenCalledWith(expect.objectContaining({ syncError: "rules" }))
  })

  it("clears syncError after a successful sync", async () => {
    mockStorageGet.mockResolvedValue(validToken())
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rules: [], schedules: [] }) })
    await syncRules()
    expect(mockApplyBlockRules).toHaveBeenCalledWith([], [])
    expect(mockStorageSet).toHaveBeenCalledWith(expect.objectContaining({ syncError: null }))
  })
})

// The periodic alarm only fires every 5 minutes, so a failed sync gets its own
// quicker retry with exponential backoff, handing back to the periodic alarm
// once the backoff reaches its interval.
describe("syncRules – automatic retry", () => {
  const validToken = (extra: Record<string, unknown> = {}) => ({
    token: "signed.tok",
    tokenExpiresAt: Date.now() + 60_000,
    ...extra,
  })

  it("schedules a retry 30 seconds after the first failure", async () => {
    mockStorageGet.mockResolvedValue(validToken())
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"))
    await syncRules()
    expect(mockAlarmsCreate).toHaveBeenCalledWith(SYNC_RETRY_ALARM, { delayInMinutes: 0.5 })
    expect(mockStorageSet).toHaveBeenCalledWith(expect.objectContaining({ syncFailures: 1 }))
  })

  it.each([
    [1, 1],
    [2, 2],
    [3, 4],
    [4, 5],
    [10, 5],
  ])("backs off after %i previous failures to a %f minute delay", async (previous, delay) => {
    mockStorageGet.mockResolvedValue(validToken({ syncFailures: previous }))
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await syncRules()
    expect(mockAlarmsCreate).toHaveBeenCalledWith(SYNC_RETRY_ALARM, { delayInMinutes: delay })
    expect(mockStorageSet).toHaveBeenCalledWith(expect.objectContaining({ syncFailures: previous + 1 }))
  })

  it("schedules a retry when the rules can't be applied", async () => {
    mockStorageGet.mockResolvedValue(validToken())
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rules: [], schedules: [] }) })
    mockApplyBlockRules.mockRejectedValue(new Error("bad rule"))
    await syncRules()
    expect(mockAlarmsCreate).toHaveBeenCalledWith(SYNC_RETRY_ALARM, expect.anything())
  })

  it("resets the failure count and cancels any pending retry after a successful sync", async () => {
    mockStorageGet.mockResolvedValue(validToken({ syncFailures: 3 }))
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rules: [], schedules: [] }) })
    await syncRules()
    expect(mockStorageSet).toHaveBeenCalledWith({ syncError: null, syncFailures: 0 })
    expect(mockAlarmsClear).toHaveBeenCalledWith(SYNC_RETRY_ALARM)
    expect(mockAlarmsCreate).not.toHaveBeenCalled()
  })

  it("does not retry when the session has expired — only a new login can fix that", async () => {
    mockStorageGet.mockResolvedValue(validToken())
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    await syncRules()
    expect(mockAlarmsCreate).not.toHaveBeenCalled()
  })
})
