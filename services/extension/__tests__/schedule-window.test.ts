import { describe, it, expect } from "vitest"
import { isWithinSchedule, isWithinAnySchedule } from "../src/schedule-window"

function makeSchedule(overrides: { startTime?: string; endTime?: string; daysOfWeek?: number[] } = {}) {
  return {
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime ?? "17:00",
    daysOfWeek: overrides.daysOfWeek ?? [1, 2, 3, 4, 5], // Mon–Fri
  }
}

// Wednesday 2026-06-03 (day 3)
function wed(hour: number, minute = 0): Date {
  return new Date(2026, 5, 3, hour, minute)
}

// Saturday 2026-06-06 (day 6)
function sat(hour: number, minute = 0): Date {
  return new Date(2026, 5, 6, hour, minute)
}

describe("isWithinSchedule – day matching", () => {
  it("returns true when the current day is in daysOfWeek and time is inside the window", () => {
    expect(isWithinSchedule(makeSchedule(), wed(12))).toBe(true)
  })

  it("returns false when the current day is not in daysOfWeek", () => {
    expect(isWithinSchedule(makeSchedule(), sat(12))).toBe(false)
  })
})

describe("isWithinSchedule – time boundaries", () => {
  it("treats the start time as inclusive", () => {
    expect(isWithinSchedule(makeSchedule({ startTime: "09:00" }), wed(9, 0))).toBe(true)
  })

  it("treats the end time as exclusive", () => {
    expect(isWithinSchedule(makeSchedule({ endTime: "17:00" }), wed(17, 0))).toBe(false)
  })

  it("returns false one minute before the start time", () => {
    expect(isWithinSchedule(makeSchedule({ startTime: "09:00" }), wed(8, 59))).toBe(false)
  })

  it("returns true one minute before the end time", () => {
    expect(isWithinSchedule(makeSchedule({ endTime: "17:00" }), wed(16, 59))).toBe(true)
  })
})

describe("isWithinAnySchedule", () => {
  it("returns false for an empty schedule list", () => {
    expect(isWithinAnySchedule([], wed(12))).toBe(false)
  })

  it("returns true when at least one schedule in the list matches", () => {
    const schedules = [
      makeSchedule({ daysOfWeek: [6] }), // Saturday only, wouldn't match Wednesday
      makeSchedule({ daysOfWeek: [1, 2, 3, 4, 5] }), // weekdays, matches Wednesday
    ]
    expect(isWithinAnySchedule(schedules, wed(12))).toBe(true)
  })

  it("returns false when no schedule in the list matches", () => {
    const schedules = [
      makeSchedule({ daysOfWeek: [6] }),
      makeSchedule({ startTime: "20:00", endTime: "22:00" }),
    ]
    expect(isWithinAnySchedule(schedules, wed(12))).toBe(false)
  })
})
