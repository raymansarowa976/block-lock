import { render, cleanup, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { notifyExtensionRulesUpdated, ExtensionBridge } from "@/components/extension-bridge"

const mockSendMessage = vi.fn()
const mockFetch = vi.fn()

function stubChromeRuntime() {
  ;(window as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: mockSendMessage, lastError: undefined },
  }
}

beforeEach(() => {
  mockSendMessage.mockReset()
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
  process.env.NEXT_PUBLIC_EXTENSION_ID = "test-extension-id"
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete (window as unknown as { chrome?: unknown }).chrome
})

describe("notifyExtensionRulesUpdated", () => {
  it("sends a BLOCK_LOCK_RULES_UPDATED message to the extension", () => {
    stubChromeRuntime()
    notifyExtensionRulesUpdated()
    expect(mockSendMessage).toHaveBeenCalledWith(
      "test-extension-id",
      { type: "BLOCK_LOCK_RULES_UPDATED" },
      expect.any(Function),
    )
  })

  it("does nothing when the extension is not installed", () => {
    expect(() => notifyExtensionRulesUpdated()).not.toThrow()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it("does nothing when NEXT_PUBLIC_EXTENSION_ID is not configured", () => {
    stubChromeRuntime()
    delete process.env.NEXT_PUBLIC_EXTENSION_ID
    notifyExtensionRulesUpdated()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

describe("ExtensionBridge", () => {
  const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
  const TOKEN = "signed.token"
  const EXPIRES_AT = 1_700_000_900_000

  it("fetches a sync token from the dashboard session on mount", async () => {
    stubChromeRuntime()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: TOKEN, expiresAt: EXPIRES_AT }),
    })
    render(<ExtensionBridge userId={USER_ID} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/sync/token"))
  })

  it("sends BLOCK_LOCK_AUTH with the fetched token and expiry, not a bare userId credential", async () => {
    stubChromeRuntime()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: TOKEN, expiresAt: EXPIRES_AT }),
    })
    render(<ExtensionBridge userId={USER_ID} />)
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        "test-extension-id",
        { type: "BLOCK_LOCK_AUTH", userId: USER_ID, token: TOKEN, expiresAt: EXPIRES_AT },
        expect.any(Function),
      ),
    )
  })

  it("does not fetch a token or message the extension when userId is empty", async () => {
    stubChromeRuntime()
    render(<ExtensionBridge userId="" />)
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it("does not message the extension when the token fetch fails", async () => {
    stubChromeRuntime()
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    render(<ExtensionBridge userId={USER_ID} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it("does not throw when the token fetch rejects (network error)", async () => {
    stubChromeRuntime()
    mockFetch.mockRejectedValue(new Error("network down"))
    expect(() => render(<ExtensionBridge userId={USER_ID} />)).not.toThrow()
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
  })

  it("re-fetches a fresh token on an interval well before the token expires, keeping the extension bound while the dashboard stays open", async () => {
    vi.useFakeTimers()
    stubChromeRuntime()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: TOKEN, expiresAt: EXPIRES_AT }),
    })
    render(<ExtensionBridge userId={USER_ID} />)

    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    // Advance past a full 15-minute token TTL — a refresh path must have
    // re-minted before then, or the extension would fall into session_expired
    // despite the dashboard tab being open the whole time.
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(mockFetch.mock.calls.length).toBeGreaterThan(1)
  })

  it("stops refreshing after unmount", async () => {
    vi.useFakeTimers()
    stubChromeRuntime()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: TOKEN, expiresAt: EXPIRES_AT }),
    })
    const { unmount } = render(<ExtensionBridge userId={USER_ID} />)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    unmount()
    const callsAtUnmount = mockFetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    expect(mockFetch.mock.calls.length).toBe(callsAtUnmount)
  })
})
