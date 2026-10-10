import React, { useCallback, useEffect, useState } from "react"
import { DASHBOARD_URL } from "./config"

type StorageState = {
  userId?: string
  lastSync?: string
  authError?: string | null
}

export function Popup(): React.ReactElement {
  const [storage, setStorage] = useState<StorageState | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const loadStorage = useCallback(async () => {
    const result = await chrome.storage.local.get(["userId", "lastSync", "authError"])
    setStorage(result as StorageState)
  }, [])

  useEffect(() => {
    loadStorage()
  }, [loadStorage])

  // Local fallback for when the dashboard is unreachable: the background
  // worker revokes the token (best-effort) and clears it from storage.
  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await chrome.runtime.sendMessage({ type: "BLOCK_LOCK_SIGNOUT" })
    } catch {
      // Worker unavailable — re-reading storage below shows the real state.
    }
    await loadStorage()
    setDisconnecting(false)
  }

  const isBound = Boolean(storage?.userId)
  const isExpired = Boolean(storage?.authError)
  const lastSync = storage?.lastSync

  return (
    <div className="w-full min-w-[280px] max-w-[400px] min-h-[200px] p-4 font-sans bg-white">
      <header role="banner" className="mb-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" className="size-6">
            <rect width="32" height="32" rx="8" fill="#dc2626"/>
            <path d="M16 5L7 9v7c0 5 3.9 9.7 9 11 5.1-1.3 9-6 9-11V9l-9-4z" fill="white"/>
            <path d="M13 16l2 2 4-4" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 className="text-base font-semibold text-gray-900 tracking-tight">Block Lock</h1>
        </div>
      </header>

      <main>
        {storage === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : isExpired ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-amber-600">Session expired</p>
            <p className="text-xs text-gray-500">
              Your web app session has ended. Log in again to keep rules syncing.
            </p>
            <a
              href={DASHBOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 underline hover:text-blue-800"
            >
              Reconnect
            </a>
          </div>
        ) : isBound ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-green-700">Connected</p>
            <div
              data-testid="sync-status"
              className="text-xs text-gray-500"
            >
              {lastSync ? (
                <span>Last synced: {new Date(lastSync).toLocaleString()}</span>
              ) : (
                <span>Never synced</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-sm text-gray-600 underline hover:text-gray-900 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-red-600">Not Connected</p>
            <a
              href={DASHBOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 underline hover:text-blue-800"
            >
              Connect your account
            </a>
          </div>
        )}
      </main>
    </div>
  )
}