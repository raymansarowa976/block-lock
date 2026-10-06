"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { DangerZone } from "@/components/danger-zone"
import { HardLockToggle } from "@/components/hard-lock-toggle"

type Tab = "account" | "defaults" | "danger"

interface SettingsTabsProps {
  user: {
    email: string
    name: string | null
    image: string | null
    createdAt: Date
    hardLockMode: boolean
  }
}

const TABS: { id: Tab; label: string }[] = [
  { id: "account", label: "Account Options" },
  { id: "defaults", label: "Block Rules Defaults" },
  { id: "danger", label: "Danger Zone" },
]

export function SettingsTabs({ user }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("account")

  return (
    <div className="space-y-6">
      <div role="tablist" className="flex gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              activeTab === id
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:text-slate-700",
              id === "danger" && "text-red-600 hover:text-red-700",
              id === "danger" && activeTab === id && "bg-red-50 text-red-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {activeTab === "account" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Account Options</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Email
                </p>
                <p className="mt-1 text-sm text-slate-900">{user.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Name
                </p>
                <p className="mt-1 text-sm text-slate-900">{user.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Joined
                </p>
                <p className="mt-1 text-sm text-slate-900">
                  {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "defaults" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Block Rules Defaults</h2>
            <HardLockToggle enabled={user.hardLockMode} />
          </div>
        )}

        {activeTab === "danger" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
            <DangerZone userEmail={user.email} />
          </div>
        )}
      </div>
    </div>
  )
}
