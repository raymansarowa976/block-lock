import { describe, it, expect } from "vitest"
import { isScheduleOverlapping } from "@/lib/schedule-overlap"

type ScheduleWindow = { startTime: string; endTime: string; daysOfWeek: number[] }

function w(start: string, end: string, days: number[]): ScheduleWindow {
  return { startTime: start, endTime: end, daysOfWeek: days }
}

// ---------------------------------------------------------------------------
// No shared days — time windows are irrelevant
// ---------------------------------------------------------------------------

describe("isScheduleOverlapping – no shared days", () => {
  it("returns false when the day sets are completely disjoint", () => {
    expect(isScheduleOverlapping(w("09:00", "17:00", [1, 2, 3]), w("09:00", "17:00", [4, 5]))).toBe(false)
  })

  it("returns false when one schedule has no days", () => {
    expect(isScheduleOverlapping(w("09:00", "17:00", [1]), w("09:00", "17:00", []))).toBe(false)
  })

  it("returns false even when time windows would fully overlap if days matched", () => {
    expect(isScheduleOverlapping(w("00:00", "23:59", [0]), w("00:00", "23:59", [6]))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Shared days, non-overlapping time windows
// ---------------------------------------------------------------------------

describe("isScheduleOverlapping – shared days, non-overlapping times", () => {
  it("returns false when a ends before b starts", () => {
    expect(isScheduleOverlapping(w("09:00", "12:00", [1]), w("13:00", "17:00", [1]))).toBe(false)
  })

  it("returns false when b ends before a starts", () => {
    expect(isScheduleOverlapping(w("13:00", "17:00", [1]), w("09:00", "12:00", [1]))).toBe(false)
  })

  it("returns false for adjacent windows — a ends exactly when b starts", () => {
    expect(isScheduleOverlapping(w("09:00", "12:00", [1]), w("12:00", "17:00", [1]))).toBe(false)
  })

  it("returns false for adjacent windows — b ends exactly when a starts", () => {
    expect(isScheduleOverlapping(w("12:00", "17:00", [1]), w("09:00", "12:00", [1]))).toBe(false)
  })

  it("returns false when days are partially shared but times do not overlap", () => {
    expect(isScheduleOverlapping(w("09:00", "12:00", [1, 3, 5]), w("13:00", "17:00", [1, 3, 5]))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Shared days, overlapping time windows
// ---------------------------------------------------------------------------

describe("isScheduleOverlapping – shared days, overlapping times", () => {
  it("returns true for a partial overlap (a leads b)", () => {
    expect(isScheduleOverlapping(w("09:00", "13:00", [1]), w("12:00", "17:00", [1]))).toBe(true)
  })

  it("returns true for a partial overlap (b leads a)", () => {
    expect(isScheduleOverlapping(w("12:00", "17:00", [1]), w("09:00", "13:00", [1]))).toBe(true)
  })

  it("returns true when a is fully contained inside b", () => {
    expect(isScheduleOverlapping(w("10:00", "12:00", [1]), w("09:00", "17:00", [1]))).toBe(true)
  })

  it("returns true when b is fully contained inside a", () => {
    expect(isScheduleOverlapping(w("09:00", "17:00", [1]), w("10:00", "12:00", [1]))).toBe(true)
  })

  it("returns true for identical time windows on the same days", () => {
    expect(isScheduleOverlapping(w("09:00", "17:00", [1, 2, 3]), w("09:00", "17:00", [1, 2, 3]))).toBe(true)
  })

  it("returns true when only one day is shared but that day's times overlap", () => {
    expect(isScheduleOverlapping(w("09:00", "17:00", [1, 2, 3]), w("09:00", "17:00", [3, 4, 5]))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Symmetry invariant
// ---------------------------------------------------------------------------

describe("isScheduleOverlapping – symmetry", () => {
  it("overlap(a, b) === overlap(b, a) for overlapping schedules", () => {
    const a = w("09:00", "13:00", [1, 2])
    const b = w("12:00", "16:00", [2, 3])
    expect(isScheduleOverlapping(a, b)).toBe(isScheduleOverlapping(b, a))
  })

  it("overlap(a, b) === overlap(b, a) for non-overlapping schedules", () => {
    const a = w("09:00", "12:00", [1])
    const b = w("13:00", "17:00", [1])
    expect(isScheduleOverlapping(a, b)).toBe(isScheduleOverlapping(b, a))
  })

  it("overlap(a, b) === overlap(b, a) when days are disjoint", () => {
    const a = w("09:00", "17:00", [0, 1])
    const b = w("09:00", "17:00", [5, 6])
    expect(isScheduleOverlapping(a, b)).toBe(isScheduleOverlapping(b, a))
  })
})