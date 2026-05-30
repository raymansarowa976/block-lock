"use client"

import { useState } from "react"
import { Globe, Trash2, Clock } from "lucide-react"
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
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4">
        <h2 className="font-semibold">Active Rules</h2>
        <p className="text-xs text-muted-foreground">
          {timeLimits.length} {timeLimits.length === 1 ? "website" : "websites"} configured
        </p>
      </div>

      {timeLimits.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Globe className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No websites blocked yet</p>
          <p className="text-xs text-muted-foreground">Add a website using the form on the left</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {timeLimits.map((rule) => (
            <li
              key={rule.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      rule.isActive ? "bg-green-500" : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="truncate text-sm font-medium">{rule.domain}</span>
                </div>
                <p className="pl-3.5 text-xs text-muted-foreground">
                  {rule.dailyLimit ? `${rule.dailyLimit} min/day` : "Fully blocked"}
                </p>
                {rule.schedules.length > 0 && (
                  <div className="pl-3.5 space-y-0.5">
                    {rule.schedules.map((s) => (
                      <div key={s.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3 shrink-0" />
                        <span>
                          {s.startTime}–{s.endTime}
                        </span>
                        <span className="text-muted-foreground/60">
                          · {s.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")}
                        </span>
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
                >
                  {rule.isActive ? (
                    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3">
                      <rect x="3" y="2" width="4" height="12" rx="1" />
                      <rect x="9" y="2" width="4" height="12" rx="1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3">
                      <path d="M4 2l10 6-10 6V2z" />
                    </svg>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDelete(rule.id)}
                  disabled={deleting === rule.id}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${rule.domain}`} title={`Delete ${rule.domain}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}