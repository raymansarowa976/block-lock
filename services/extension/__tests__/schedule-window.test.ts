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

// A window whose end is earlier than its start crosses midnight, e.g. 22:00–06:00.
// It belongs to the day it starts on: a Monday 22:00–06:00 window runs from
// Monday 22:00 until Tuesday 06:00.
describe("isWithinSchedule – overnight windows", () => {
  // Monday 2026-06-01 (day 1), Tuesday 2026-06-02 (day 2), Sunday 2026-06-07 (day 0)
  const mon = (h: number, m = 0) => new Date(2026, 5, 1, h, m)
  const tue = (h: number, m = 0) => new Date(2026, 5, 2, h, m)
  const sun = (h: number, m = 0) => new Date(2026, 5, 7, h, m)
  const monNight = makeSchedule({ startTime: "22:00", endTime: "06:00", daysOfWeek: [1] })

  it("matches before midnight on the start day", () => {
    expect(isWithinSchedule(monNight, mon(23, 30))).toBe(true)
  })

  it("treats the start time as inclusive", () => {
    expect(isWithinSchedule(monNight, mon(22, 0))).toBe(true)
  })

  it("matches after midnight on the following day", () => {
    expect(isWithinSchedule(monNight, tue(0, 0))).toBe(true)
    expect(isWithinSchedule(monNight, tue(5, 59))).toBe(true)
  })

  it("treats the end time on the following day as exclusive", () => {
    expect(isWithinSchedule(monNight, tue(6, 0))).toBe(false)
  })

  it("does not match the start day's early morning, which belongs to the previous day's window", () => {
    expect(isWithinSchedule(monNight, mon(3, 0))).toBe(false)
  })

  it("does not match the following day's evening unless that day is also selected", () => {
    expect(isWithinSchedule(monNight, tue(23, 0))).toBe(false)
  })

  it("does not match during the daytime gap", () => {
    expect(isWithinSchedule(monNight, mon(12, 0))).toBe(false)
  })

  it("carries a Saturday-night window into Sunday morning across the week boundary", () => {
    const satNight = makeSchedule({ startTime: "22:00", endTime: "06:00", daysOfWeek: [6] })
    expect(isWithinSchedule(satNight, sun(2, 0))).toBe(true)
  })

  it("treats an end of 00:00 as midnight at the end of the start day", () => {
    const lateEvening = makeSchedule({ startTime: "22:00", endTime: "00:00", daysOfWeek: [1] })
    expect(isWithinSchedule(lateEvening, mon(23, 59))).toBe(true)
    expect(isWithinSchedule(lateEvening, tue(0, 0))).toBe(false)
  })
})

describe("isWithinSchedule – zero-length windows", () => {
  it("never matches a window whose start equals its end", () => {
    const empty = makeSchedule({ startTime: "09:00", endTime: "09:00" })
    expect(isWithinSchedule(empty, wed(9, 0))).toBe(false)
    expect(isWithinSchedule(empty, wed(12, 0))).toBe(false)
  })
})
