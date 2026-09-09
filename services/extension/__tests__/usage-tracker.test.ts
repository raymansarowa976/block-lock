import { describe, it, expect, vi, beforeEach } from "vitest"
import { getMinutesUsedToday, addUsageMinutes, todayKey } from "../src/usage-tracker"

const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
})

beforeEach(() => {
  mockStorageGet.mockReset().mockResolvedValue({})
  mockStorageSet.mockReset().mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// todayKey
// ---------------------------------------------------------------------------

describe("todayKey", () => {
  it("formats a date as YYYY-MM-DD using local date components", () => {
    expect(todayKey(new Date(2026, 5, 3))).toBe("2026-06-03")
  })

  it("zero-pads single digit months and days", () => {
    expect(todayKey(new Date(2026, 0, 9))).toBe("2026-01-09")
  })
})

// ---------------------------------------------------------------------------
// getMinutesUsedToday
// ---------------------------------------------------------------------------

describe("getMinutesUsedToday", () => {
  it("returns 0 when no usage has ever been recorded for the domain", async () => {
    mockStorageGet.mockResolvedValue({})
    const minutes = await getMinutesUsedToday("example.com", new Date(2026, 5, 3))
    expect(minutes).toBe(0)
  })

  it("returns the stored minutesUsed when the entry is from today", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: "2026-06-03", minutesUsed: 12 } },
    })
    const minutes = await getMinutesUsedToday("example.com", new Date(2026, 5, 3))
    expect(minutes).toBe(12)
  })

  it("treats a previous-day entry as reset (returns 0)", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: "2026-06-02", minutesUsed: 20 } },
    })
    const minutes = await getMinutesUsedToday("example.com", new Date(2026, 5, 3))
    expect(minutes).toBe(0)
  })

  it("does not write to storage (read-only check)", async () => {
    mockStorageGet.mockResolvedValue({})
    await getMinutesUsedToday("example.com", new Date(2026, 5, 3))
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// addUsageMinutes
// ---------------------------------------------------------------------------

describe("addUsageMinutes", () => {
  it("creates a new entry with the given minutes when the domain has no prior usage", async () => {
    mockStorageGet.mockResolvedValue({})
    const total = await addUsageMinutes("example.com", 1, new Date(2026, 5, 3))
    expect(total).toBe(1)
    expect(mockStorageSet).toHaveBeenCalledWith({
      dailyUsage: { "example.com": { date: "2026-06-03", minutesUsed: 1 } },
    })
  })

  it("accumulates minutes onto an existing same-day entry", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: "2026-06-03", minutesUsed: 5 } },
    })
    const total = await addUsageMinutes("example.com", 1, new Date(2026, 5, 3))
    expect(total).toBe(6)
  })

  it("resets to the given minutes rather than accumulating when the stored entry is from a previous day", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: "2026-06-02", minutesUsed: 20 } },
    })
    const total = await addUsageMinutes("example.com", 1, new Date(2026, 5, 3))
    expect(total).toBe(1)
  })

  it("writes the updated date alongside the reset minutes after a day rollover", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: "2026-06-02", minutesUsed: 20 } },
    })
    await addUsageMinutes("example.com", 1, new Date(2026, 5, 3))
    expect(mockStorageSet).toHaveBeenCalledWith({
      dailyUsage: { "example.com": { date: "2026-06-03", minutesUsed: 1 } },
    })
  })

  it("preserves other domains' entries when writing back", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "other.com": { date: "2026-06-03", minutesUsed: 3 } },
    })
    await addUsageMinutes("example.com", 1, new Date(2026, 5, 3))
    expect(mockStorageSet).toHaveBeenCalledWith({
      dailyUsage: {
        "other.com": { date: "2026-06-03", minutesUsed: 3 },
        "example.com": { date: "2026-06-03", minutesUsed: 1 },
      },
    })
  })
})
