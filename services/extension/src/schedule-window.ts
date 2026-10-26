type ScheduleWindow = {
  startTime: string
  endTime: string
  daysOfWeek: number[]
}

function toHHMM(now: Date): string {
  const h = String(now.getHours()).padStart(2, "0")
  const m = String(now.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}

// HH:MM strings compare correctly with lexicographic ordering. A window whose
// end is earlier than its start (e.g. 22:00–06:00) crosses midnight and
// belongs to the day it starts on, so its after-midnight part is checked
// against the previous day. start === end is rejected by the schemas and
// never matches here.
export function isWithinSchedule(schedule: ScheduleWindow, now: Date): boolean {
  const { startTime, endTime, daysOfWeek } = schedule
  const current = toHHMM(now)
  const today = now.getDay()

  if (startTime < endTime) {
    return daysOfWeek.includes(today) && current >= startTime && current < endTime
  }

  if (startTime > endTime) {
    const yesterday = (today + 6) % 7
    return (
      (daysOfWeek.includes(today) && current >= startTime) ||
      (daysOfWeek.includes(yesterday) && current < endTime)
    )
  }

  return false
}

export function isWithinAnySchedule(schedules: ScheduleWindow[], now: Date): boolean {
  return schedules.some((s) => isWithinSchedule(s, now))
}
