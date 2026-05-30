"use client"

import { useState } from "react"
import { Globe, Trash2, Clock, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { deleteTimeLimit, updateTimeLimit } from "@/lib/actions/time-limits"

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

export function ActiveRulesList({ timeLimits }: ActiveRulesListProps) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    await deleteTimeLimit(id)
    setDeleting(null)
  }

  async function handleToggle(id: string, isActive: boolean) {
    setToggling(id)
    await updateTimeLimit(id, { isActive: !isActive })
    setToggling(null)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Active Rules</h2>
          <p className="text-xs text-slate-500">
            {timeLimits.length} {timeLimits.length === 1 ? "website" : "websites"} configured
          </p>
        </div>
        {timeLimits.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-50 border border-red-100 px-3 py-1 text-xs font-semibold text-red-600">
            {timeLimits.filter((t) => t.isActive).length} active
          </span>
        )}
      </div>

      {timeLimits.length === 0 ? (
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
          {timeLimits.map((rule) => (
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

                  <p className="pl-1 text-xs text-slate-400">
                    {rule.dailyLimit ? `${rule.dailyLimit} min/day` : "Fully blocked"}
                  </p>

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
                    onClick={() => handleToggle(rule.id, rule.isActive)}
                    disabled={toggling === rule.id}
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
                    disabled={deleting === rule.id}
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