import React, { useEffect, useState } from "react"

type StorageState = {
  userId?: string
  lastSync?: string
}

const DASHBOARD_URL = "https://block-lock.vercel.app/login"

export function Popup(): React.ReactElement {
  const [storage, setStorage] = useState<StorageState | null>(null)

  useEffect(() => {
    chrome.storage.local.get(["userId", "lastSync"]).then((result) => {
      setStorage(result as StorageState)
    })
  }, [])

  const isBound = Boolean(storage?.userId)
  const lastSync = storage?.lastSync

  return (
    <div className="w-full min-w-[280px] max-w-[400px] min-h-[200px] p-4 font-sans bg-white">
      <header role="banner" className="mb-4 border-b border-gray-200 pb-3">
        <h1 className="text-base font-semibold text-gray-900 tracking-tight">
          Block Lock
        </h1>
      </header>

      <main>
        {storage === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
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
