"use client"

import { useEffect } from "react"

type ChromeRuntime = {
  lastError?: { message?: string }
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: () => void,
  ) => void
}

// chrome.runtime is only present when the Block Lock extension is installed
function getChromeRuntime(): ChromeRuntime | null {
  try {
    const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } }
    return w.chrome?.runtime ?? null
  } catch {
    return null
  }
}

function sendToExtension(message: unknown): void {
  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID
  if (!extensionId) return

  const runtime = getChromeRuntime()
  if (!runtime) return

  try {
    runtime.sendMessage(extensionId, message, () => {
      // Reading lastError acknowledges it and prevents Chrome from
      // surfacing it as an uncaught runtime error in the page
      void runtime.lastError
    })
  } catch {
    // Extension not installed or extension ID mismatch — ignore
  }
}

// Pushes an immediate re-sync to the extension so rule/profile changes take
// effect without waiting for its 5-minute polling alarm.
export function notifyExtensionRulesUpdated(): void {
  sendToExtension({ type: "BLOCK_LOCK_RULES_UPDATED" })
}

export function ExtensionBridge({ userId }: { userId: string }) {
  useEffect(() => {
    if (!userId) return
    sendToExtension({ type: "BLOCK_LOCK_AUTH", userId })
  }, [userId])

  return null
}