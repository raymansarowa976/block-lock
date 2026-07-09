"use client"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const DISPLAY_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = [0, 15, 30, 45]

function pad(n: number) {
  return n.toString().padStart(2, "0")
}

const TIME_OPTIONS = DISPLAY_HOURS.flatMap((hour) =>
  MINUTES.map((minute) => `${pad(hour)}:${pad(minute)}`),
)

type Period = "AM" | "PM"

function to24Hour(displayHour: number, period: Period) {
  if (period === "AM") return displayHour === 12 ? 0 : displayHour
  return displayHour === 12 ? 12 : displayHour + 12
}

interface TimeSelectProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

export function TimeSelect({ id, label, value, onChange }: TimeSelectProps) {
  const [hourStr, minuteStr] = value.split(":")
  const hours24 = hourStr ? Number(hourStr) : null
  const minutes = minuteStr ?? "00"
  const period: Period | null = hours24 === null ? null : hours24 >= 12 ? "PM" : "AM"
  const displayHour = hours24 === null ? null : hours24 % 12 === 0 ? 12 : hours24 % 12
  const selectValue = displayHour === null ? "" : `${pad(displayHour)}:${minutes}`

  function commit(nextDisplayHour: number, nextMinutes: string, nextPeriod: Period) {
    onChange(`${pad(to24Hour(nextDisplayHour, nextPeriod))}:${nextMinutes}`)
  }

  function handleSelectChange(next: string) {
    const [dh, mm] = next.split(":")
    commit(Number(dh), mm, period ?? "AM")
  }

  function handlePeriodClick(nextPeriod: Period) {
    commit(displayHour ?? 12, minutes, nextPeriod)
  }

  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <Label htmlFor={id} className="text-slate-700">{label}</Label>
      <div className="flex items-center gap-1.5">
        <select
          id={id}
          value={selectValue}
          onChange={(e) => handleSelectChange(e.target.value)}
          className={cn(
            "h-10 w-full rounded-full border border-input bg-transparent px-4 text-base outline-none transition-all",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm",
          )}
        >
          <option value="" disabled>
            Select time
          </option>
          {TIME_OPTIONS.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => handlePeriodClick(p)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                period === p
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
