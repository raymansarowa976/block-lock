"use client"

import { useState, useOptimistic, useCallback, startTransition } from "react"
import { Globe, Trash2, Clock, Pause, Play, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { deleteTimeLimit, updateTimeLimit } from "@/lib/actions/time-limits"
import { notifyExtensionRulesUpdated } from "@/components/extension-bridge"

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

type Schedule = {
  id: string
  startTime: string
  endTime: string
  daysOfWeek: number[]
}

type TimeLimit = {
  id: string
  domain: string
  dailyLimit: number | null
  isActive: boolean
  schedules: Schedule[]
}

interface ActiveRulesListProps {
  timeLimits: TimeLimit[]
}

type OptimisticAction =
  | { type: "delete"; id: string }
  | { type: "toggle"; id: string }

function optimisticReducer(state: TimeLimit[], action: OptimisticAction): TimeLimit[] {
  switch (action.type) {
    case "delete":
      return state.filter((r) => r.id !== action.id)
    case "toggle":
      return state.map((r) =>
        r.id === action.id ? { ...r, isActive: !r.isActive } : r,
      )
    default:
      return state
  }
}

export function ActiveRulesList({ timeLimits }: ActiveRulesListProps) {
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set())
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const [, addOptimistic] = useOptimistic(timeLimits, optimisticReducer)

  const optimisticRules = timeLimits
    .filter((r) => !pendingDeletes.has(r.id))
    .map((r) => (pendingToggles.has(r.id) ? { ...r, isActive: !r.isActive } : r))

  const handleDelete = useCallback(async (id: string) => {
    setError(null)
    setPendingDeletes((s) => new Set(s).add(id))
    startTransition(() => {
      addOptimistic({ type: "delete", id })
    })
    try {
      const result = await deleteTimeLimit(id)
      if (!result.success) {
        setPendingDeletes((s) => { const n = new Set(s); n.delete(id); return n })
        setError(typeof result.error === "string" ? result.error : "Failed to delete rule")
      } else {
        notifyExtensionRulesUpdated()
      }
    } catch {
      setPendingDeletes((s) => { const n = new Set(s); n.delete(id); return n })
      setError("An unexpected error occurred")
    }
  }, [addOptimistic])

  const handleToggle = useCallback(async (id: string) => {
    setError(null)
    setPendingToggles((s) => new Set(s).add(id))
    startTransition(() => {
      addOptimistic({ type: "toggle", id })
    })
    try {
      const rule = timeLimits.find((r) => r.id === id)
      const result = await updateTimeLimit(id, { isActive: !rule?.isActive })
      if (!result.success) {
        setPendingToggles((s) => { const n = new Set(s); n.delete(id); return n })
        setError(typeof result.error === "string" ? result.error : "Failed to update rule")
      } else {
        notifyExtensionRulesUpdated()
      }
    } catch {
      setPendingToggles((s) => { const n = new Set(s); n.delete(id); return n })
      setError("An unexpected error occurred")
    }
  }, [addOptimistic, timeLimits])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Active Rules</h2>
          <p className="text-xs text-slate-500">
            {optimisticRules.length}{" "}
            {optimisticRules.length === 1 ? "website" : "websites"} configured
          </p>
        </div>
        {optimisticRules.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-50 border border-red-100 px-3 py-1 text-xs font-semibold text-red-600">
            {optimisticRules.filter((t) => t.isActive).length} active
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-3 shrink-0 text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {optimisticRules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-slate-100">
            <Globe className="size-6 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">No websites blocked yet</p>
            <p className="text-xs text-slate-400">Add a website using the form on the left</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {optimisticRules.map((rule) => (
            <li key={rule.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                      rule.isActive
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-slate-200 bg-slate-100 text-slate-500",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        rule.isActive ? "bg-red-500" : "bg-slate-400",
                      )}
                    />
                    {rule.domain}
                  </span>

                  {rule.dailyLimit !== null ? (
                    <span
                      data-testid="status-metered"
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                    >
                      <Clock className="size-3" />
                      {rule.dailyLimit} min/day
                    </span>
                  ) : (
                    <span
                      data-testid="status-blocked"
                      className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                    >
                      Blocked
                    </span>
                  )}

                  {rule.schedules.length > 0 && (
                    <div className="space-y-0.5 pl-1">
                      {rule.schedules.map((s) => (
                        <div key={s.id} className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="size-3 shrink-0" />
                          <span>
                            {s.startTime}–{s.endTime}
                          </span>
                          <span>· {s.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleToggle(rule.id)}
                    title={rule.isActive ? "Pause rule" : "Enable rule"}
                    aria-label={rule.isActive ? "Pause rule" : "Enable rule"}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    {rule.isActive ? <Pause /> : <Play />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(rule.id)}
                    title={`Delete ${rule.domain}`}
                    aria-label={`Delete ${rule.domain}`}
                    className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
