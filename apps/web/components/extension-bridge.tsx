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

export function ExtensionBridge({ userId }: { userId: string }) {
  useEffect(() => {
    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID
    if (!extensionId || !userId) return

    const runtime = getChromeRuntime()
    if (!runtime) return

    try {
      runtime.sendMessage(extensionId, { type: "BLOCK_LOCK_AUTH", userId }, () => {
        // Reading lastError acknowledges it and prevents Chrome from
        // surfacing it as an uncaught runtime error in the page
        void runtime.lastError
      })
    } catch {
      // Extension not installed or extension ID mismatch — ignore
    }
  }, [userId])

  return null
}