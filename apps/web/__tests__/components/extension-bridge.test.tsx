import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { notifyExtensionRulesUpdated } from "@/components/extension-bridge"

const mockSendMessage = vi.fn()

function stubChromeRuntime() {
  ;(window as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: mockSendMessage, lastError: undefined },
  }
}

beforeEach(() => {
  mockSendMessage.mockReset()
  process.env.NEXT_PUBLIC_EXTENSION_ID = "test-extension-id"
})

afterEach(() => {
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
