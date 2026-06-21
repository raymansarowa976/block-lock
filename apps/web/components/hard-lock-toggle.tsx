"use client"

import { useState } from "react"
import { updateHardLockMode } from "@/lib/actions/settings"
import { cn } from "@/lib/utils"

interface HardLockToggleProps {
  enabled: boolean
}

export function HardLockToggle({ enabled: initialEnabled }: HardLockToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, setPending] = useState(false)

  async function handleToggle() {
    setPending(true)
    const newValue = !enabled
    const result = await updateHardLockMode(newValue)
    if (result.success) {
      setEnabled(newValue)
    }
    setPending(false)
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-1 pr-4">
        <p className="text-sm font-medium text-slate-900">Hard Lock Mode</p>
        <p className="text-sm text-slate-500">
          Prevents modification or deletion of active block schedules while an
          enforced blocking window is running.
        </p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={handleToggle}
        disabled={pending}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
          enabled ? "bg-red-600" : "bg-slate-200",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
            enabled ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  )
}
