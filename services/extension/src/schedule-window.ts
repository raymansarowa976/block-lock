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

export function isWithinSchedule(schedule: ScheduleWindow, now: Date): boolean {
  if (!schedule.daysOfWeek.includes(now.getDay())) return false

  const current = toHHMM(now)
  return current >= schedule.startTime && current < schedule.endTime
}

export function isWithinAnySchedule(schedules: ScheduleWindow[], now: Date): boolean {
  return schedules.some((s) => isWithinSchedule(s, now))
}
