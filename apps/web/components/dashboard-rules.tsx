"use client"

import { useRef, useState } from "react"
import type { ReactNode } from "react"
import { ErrorBoundary } from "@/components/error-boundary"
import { TimeLimitForm } from "@/components/time-limit-form"
import { ActiveRulesList } from "@/components/active-rules-list"

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

interface DashboardRulesProps {
  timeLimits: TimeLimit[]
  children?: ReactNode
}

export function DashboardRules({ timeLimits, children }: DashboardRulesProps) {
  const [pendingAdds, setPendingAdds] = useState<TimeLimit[]>([])
  const [prevTimeLimits, setPrevTimeLimits] = useState(timeLimits)
  const nextOptimisticId = useRef(0)

  // Once the server-rendered timeLimits prop actually refreshes (via
  // router.refresh() after a successful mutation), it already contains the
  // new rule — drop our temporary copy so it isn't shown twice.
  if (timeLimits !== prevTimeLimits) {
    setPrevTimeLimits(timeLimits)
    setPendingAdds([])
  }

  function handleOptimisticAdd(rule: Omit<TimeLimit, "id">): string {
    nextOptimisticId.current += 1
    const id = `optimistic-${nextOptimisticId.current}`
    setPendingAdds((prev) => [{ ...rule, id }, ...prev])
    return id
  }

  function handleOptimisticAddFailed(id: string) {
    setPendingAdds((prev) => prev.filter((rule) => rule.id !== id))
  }

  const mergedRules = [...pendingAdds, ...timeLimits]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <ErrorBoundary>
          <TimeLimitForm
            onOptimisticAdd={handleOptimisticAdd}
            onOptimisticAddFailed={handleOptimisticAddFailed}
          />
        </ErrorBoundary>
        {children}
      </div>

      <div className="lg:col-span-2">
        <ErrorBoundary>
          <ActiveRulesList timeLimits={mergedRules} />
        </ErrorBoundary>
      </div>
    </div>
  )
}
