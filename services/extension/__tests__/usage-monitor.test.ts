import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TimeLimit, Schedule } from "@block-lock/shared-types"

const { mockApplyBlockRules } = vi.hoisted(() => ({ mockApplyBlockRules: vi.fn() }))
vi.mock("../src/rule-engine", () => ({
  applyBlockRules: mockApplyBlockRules,
}))

import { registerUsageTickAlarm, handleUsageTick, USAGE_TICK_ALARM } from "../src/usage-monitor"

const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()
const mockAlarmsCreate = vi.fn()
const mockTabsQuery = vi.fn()

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
  alarms: {
    create: mockAlarmsCreate,
  },
  tabs: {
    query: mockTabsQuery,
  },
})

beforeEach(() => {
  mockStorageGet.mockReset().mockResolvedValue({})
  mockStorageSet.mockReset().mockResolvedValue(undefined)
  mockAlarmsCreate.mockReset()
  mockTabsQuery.mockReset().mockResolvedValue([])
  mockApplyBlockRules.mockReset().mockResolvedValue(undefined)
})

function makeRule(overrides: Partial<TimeLimit> = {}): TimeLimit {
  return {
    id: "rid-1",
    userId: "user-123",
    domain: "example.com",
    isActive: true,
    dailyLimit: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "sched-1",
    timeLimitId: "rid-1",
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: [1, 2, 3, 4, 5],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// registerUsageTickAlarm
// ---------------------------------------------------------------------------

describe("registerUsageTickAlarm", () => {
  it("creates an alarm named USAGE_TICK_ALARM with a 1 minute period", () => {
    registerUsageTickAlarm()
    expect(mockAlarmsCreate).toHaveBeenCalledWith(USAGE_TICK_ALARM, { periodInMinutes: 1 })
  })
})

// ---------------------------------------------------------------------------
// handleUsageTick – reapplies block rules every tick (schedule enforcement)
// ---------------------------------------------------------------------------

describe("handleUsageTick – reapplying block rules for schedule boundary enforcement", () => {
  it("does nothing at all when there are no stored rules", async () => {
    mockStorageGet.mockResolvedValue({ rules: [] })
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockTabsQuery).not.toHaveBeenCalled()
    expect(mockApplyBlockRules).not.toHaveBeenCalled()
  })

  it("reapplies block rules every tick even when no rule has a dailyLimit (schedule-only rule)", async () => {
    const rules = [makeRule({ dailyLimit: null })]
    mockStorageGet.mockResolvedValue({ rules })
    const now = new Date(2026, 5, 3)
    await handleUsageTick(now)
    expect(mockApplyBlockRules).toHaveBeenCalledWith(rules, [], now)
  })

  it("reapplies block rules every tick even when there is no active tab", async () => {
    const rules = [makeRule()]
    mockStorageGet.mockResolvedValue({ rules })
    mockTabsQuery.mockResolvedValue([])
    const now = new Date(2026, 5, 3)
    await handleUsageTick(now)
    expect(mockApplyBlockRules).toHaveBeenCalledWith(rules, [], now)
  })

  it("threads the stored schedules through to applyBlockRules", async () => {
    const rules = [makeRule({ dailyLimit: null })]
    const schedules = [makeSchedule()]
    mockStorageGet.mockResolvedValue({ rules, schedules })
    const now = new Date(2026, 5, 3)
    await handleUsageTick(now)
    expect(mockApplyBlockRules).toHaveBeenCalledWith(rules, schedules, now)
  })

  it("defaults to an empty schedules array when none are stored", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule({ dailyLimit: null })] })
    await handleUsageTick(new Date(2026, 5, 3))
    const [, schedulesArg] = mockApplyBlockRules.mock.calls[0]
    expect(schedulesArg).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// handleUsageTick – active-tab usage tracking only applies to dailyLimit rules
// ---------------------------------------------------------------------------

describe("handleUsageTick – active-tab usage tracking scope", () => {
  it("does not query tabs when no rule has a dailyLimit set", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule({ dailyLimit: null })] })
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockTabsQuery).not.toHaveBeenCalled()
  })

  it("does not query tabs when the only dailyLimit rule is inactive", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule({ isActive: false })] })
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockTabsQuery).not.toHaveBeenCalled()
  })

  it("queries the active tab in the last focused window when a rule has a dailyLimit set", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule()] })
    mockTabsQuery.mockResolvedValue([{ url: "https://example.com/path" }])
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockTabsQuery).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true })
  })

  it("does not record usage when there is no active tab", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule()] })
    mockTabsQuery.mockResolvedValue([])
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("does not record usage when the active tab has no URL", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule()] })
    mockTabsQuery.mockResolvedValue([{ url: undefined }])
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("does not record usage when the active tab's domain does not match any limited rule", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule({ domain: "example.com" })] })
    mockTabsQuery.mockResolvedValue([{ url: "https://unrelated.com/" }])
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// handleUsageTick – recording usage
// ---------------------------------------------------------------------------

describe("handleUsageTick – recording usage against the active tab's domain", () => {
  it("records one minute of usage for the matching domain", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule({ domain: "example.com" })] })
    mockTabsQuery.mockResolvedValue([{ url: "https://example.com/path" }])
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockStorageSet).toHaveBeenCalledWith({
      dailyUsage: { "example.com": { date: "2026-06-03", minutesUsed: 1 } },
    })
  })

  it("matches a sanitised tab hostname against a rule domain stored with a protocol prefix", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeRule({ domain: "https://example.com/" })] })
    mockTabsQuery.mockResolvedValue([{ url: "https://example.com/path" }])
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ dailyUsage: expect.objectContaining({ "example.com": expect.anything() }) }),
    )
  })

  it("re-applies block rules using the stored rules after recording usage", async () => {
    const rules = [makeRule({ domain: "example.com" })]
    mockStorageGet.mockResolvedValue({ rules })
    mockTabsQuery.mockResolvedValue([{ url: "https://example.com/path" }])
    const now = new Date(2026, 5, 3)
    await handleUsageTick(now)
    expect(mockApplyBlockRules).toHaveBeenCalledWith(rules, [], now)
  })

  it("accumulates onto existing same-day usage rather than overwriting it", async () => {
    mockStorageGet.mockResolvedValue({
      rules: [makeRule({ domain: "example.com" })],
      dailyUsage: { "example.com": { date: "2026-06-03", minutesUsed: 4 } },
    })
    mockTabsQuery.mockResolvedValue([{ url: "https://example.com/path" }])
    await handleUsageTick(new Date(2026, 5, 3))
    expect(mockStorageSet).toHaveBeenCalledWith({
      dailyUsage: { "example.com": { date: "2026-06-03", minutesUsed: 5 } },
    })
  })
})
