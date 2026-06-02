type ScheduleWindow = {
  startTime: string
  endTime: string
  daysOfWeek: number[]
}

/**
 * Returns true if two schedule windows share at least one calendar day AND
 * their time ranges intersect (strictly — adjacent windows do not overlap).
 *
 * HH:MM strings compare correctly with JS lexicographic ordering.
 */
export function isScheduleOverlapping(a: ScheduleWindow, b: ScheduleWindow): boolean {
  const sharesDay = a.daysOfWeek.some((d) => b.daysOfWeek.includes(d))
  if (!sharesDay) return false

  return a.startTime < b.endTime && b.startTime < a.endTime
}