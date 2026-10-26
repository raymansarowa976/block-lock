type ScheduleWindow = {
  startTime: string
  endTime: string
  daysOfWeek: number[]
}

const MINUTES_PER_DAY = 24 * 60
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

// Expands a schedule into [start, end) minute ranges within a Sunday-00:00
// based week. A window whose end is earlier than its start (e.g. 22:00–06:00)
// runs into the next day; one that runs past Saturday midnight is split so
// its tail wraps to Sunday morning.
function weeklyRanges(s: ScheduleWindow): Array<[number, number]> {
  const start = toMinutes(s.startTime)
  const end = toMinutes(s.endTime)
  if (start === end) return []
  const length = end > start ? end - start : MINUTES_PER_DAY - start + end

  return s.daysOfWeek.flatMap((day): Array<[number, number]> => {
    const from = day * MINUTES_PER_DAY + start
    const to = from + length
    if (to <= MINUTES_PER_WEEK) return [[from, to]]
    return [
      [from, MINUTES_PER_WEEK],
      [0, to - MINUTES_PER_WEEK],
    ]
  })
}

/**
 * Returns true if two schedule windows are ever active at the same time
 * (strictly — adjacent windows do not overlap). Overnight windows count
 * toward the day they start on and extend into the following morning.
 */
export function isScheduleOverlapping(a: ScheduleWindow, b: ScheduleWindow): boolean {
  const rangesB = weeklyRanges(b)
  return weeklyRanges(a).some(([aFrom, aTo]) =>
    rangesB.some(([bFrom, bTo]) => aFrom < bTo && bFrom < aTo),
  )
}
