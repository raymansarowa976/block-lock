import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TimeLimit, Schedule } from "@block-lock/shared-types"
import { applyBlockRules } from "../src/rule-engine"

const mockGetDynamicRules = vi.fn()
const mockUpdateDynamicRules = vi.fn()
const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()

vi.stubGlobal("chrome", {
  declarativeNetRequest: {
    getDynamicRules: mockGetDynamicRules,
    updateDynamicRules: mockUpdateDynamicRules,
    RuleActionType: { BLOCK: "block", REDIRECT: "redirect" },
    ResourceType: { MAIN_FRAME: "main_frame" },
  },
  storage: {
    local: { get: mockStorageGet, set: mockStorageSet },
  },
})

beforeEach(() => {
  mockGetDynamicRules.mockReset().mockResolvedValue([])
  mockUpdateDynamicRules.mockReset().mockResolvedValue(undefined)
  mockStorageGet.mockReset().mockResolvedValue({})
  mockStorageSet.mockReset().mockResolvedValue(undefined)
})

function makeRule(domain: string, overrides: Partial<TimeLimit> = {}): TimeLimit {
  return {
    id: "rid-1",
    userId: "user-123",
    domain,
    isActive: true,
    dailyLimit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Rule structure
// ---------------------------------------------------------------------------

describe("applyBlockRules – rule structure passed to updateDynamicRules", () => {
  it("calls updateDynamicRules with a urlFilter derived from the domain", async () => {
    await applyBlockRules([makeRule("example.com")])
    expect(mockUpdateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({
        addRules: expect.arrayContaining([
          expect.objectContaining({ condition: expect.objectContaining({ urlFilter: "||example.com^" }) }),
        ]),
      }),
    )
  })

  it("assigns sequential ids starting at 1", async () => {
    await applyBlockRules([makeRule("a.com"), makeRule("b.com")])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules.map((r: { id: number }) => r.id)).toEqual([1, 2])
  })

  it("sets priority to 1 on every rule", async () => {
    await applyBlockRules([makeRule("a.com")])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].priority).toBe(1)
  })

  it("sets action type to the declarativeNetRequest REDIRECT enum value", async () => {
    await applyBlockRules([makeRule("a.com")])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].action.type).toBe("redirect")
  })

  it("sets the redirect extensionPath to the blocked page with the domain as a query param", async () => {
    await applyBlockRules([makeRule("example.com")])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].action.redirect.extensionPath).toBe("/blocked.html?domain=example.com")
  })

  it("sets resourceTypes to [MAIN_FRAME]", async () => {
    await applyBlockRules([makeRule("a.com")])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].condition.resourceTypes).toEqual(["main_frame"])
  })
})

// ---------------------------------------------------------------------------
// Existing rule removal
// ---------------------------------------------------------------------------

describe("applyBlockRules – existing rule cleanup", () => {
  it("fetches existing dynamic rules before updating", async () => {
    await applyBlockRules([])
    expect(mockGetDynamicRules).toHaveBeenCalled()
  })

  it("passes existing rule ids as removeRuleIds", async () => {
    mockGetDynamicRules.mockResolvedValue([{ id: 7 }, { id: 8 }])
    await applyBlockRules([makeRule("a.com")])
    expect(mockUpdateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({ removeRuleIds: [7, 8] }),
    )
  })

  it("passes an empty removeRuleIds when there are no existing rules", async () => {
    mockGetDynamicRules.mockResolvedValue([])
    await applyBlockRules([makeRule("a.com")])
    expect(mockUpdateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({ removeRuleIds: [] }),
    )
  })
})

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe("applyBlockRules – inactive and invalid rules are excluded", () => {
  it("does not add rules for inactive entries", async () => {
    await applyBlockRules([makeRule("blocked.com", { isActive: true }), makeRule("skipped.com", { isActive: false })])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(1)
    expect(addRules[0].condition.urlFilter).toBe("||blocked.com^")
  })

  it("excludes domains that cannot be sanitised (e.g. plain words)", async () => {
    await applyBlockRules([makeRule("not a domain")])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })

  it("sanitises a protocol-prefixed domain before building the urlFilter", async () => {
    await applyBlockRules([makeRule("https://example.com/path")])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].condition.urlFilter).toBe("||example.com^")
  })
})

// ---------------------------------------------------------------------------
// Post-apply storage update
// ---------------------------------------------------------------------------

describe("applyBlockRules – lastSync", () => {
  it("writes lastSync to storage after applying rules", async () => {
    await applyBlockRules([])
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastSync: expect.any(String) }),
    )
  })

  it("writes the rules array to storage after applying rules", async () => {
    const rules = [makeRule("a.com")]
    await applyBlockRules(rules)
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ rules: expect.any(Array) }),
    )
  })
})

// ---------------------------------------------------------------------------
// Daily limit budget enforcement
// ---------------------------------------------------------------------------

describe("applyBlockRules – domains with no dailyLimit are always blocked", () => {
  it("adds a block rule regardless of any usage state", async () => {
    mockStorageGet.mockResolvedValue({})
    await applyBlockRules([makeRule("example.com", { dailyLimit: null })])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(1)
  })
})

describe("applyBlockRules – domains with a dailyLimit are reachable until the budget is used up", () => {
  it("does not block the domain when there is no recorded usage yet", async () => {
    mockStorageGet.mockResolvedValue({})
    await applyBlockRules([makeRule("example.com", { dailyLimit: 20 })])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })

  it("does not block the domain when minutesUsed today is below the dailyLimit", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: todayKey(), minutesUsed: 19 } },
    })
    await applyBlockRules([makeRule("example.com", { dailyLimit: 20 })])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })

  it("blocks the domain once minutesUsed today reaches the dailyLimit", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: todayKey(), minutesUsed: 20 } },
    })
    await applyBlockRules([makeRule("example.com", { dailyLimit: 20 })])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(1)
    expect(addRules[0].condition.urlFilter).toBe("||example.com^")
  })

  it("blocks the domain when minutesUsed today exceeds the dailyLimit", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: todayKey(), minutesUsed: 25 } },
    })
    await applyBlockRules([makeRule("example.com", { dailyLimit: 20 })])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(1)
  })

  it("treats a previous day's usage entry as reset, leaving the domain reachable", async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: todayKey(yesterday), minutesUsed: 999 } },
    })
    await applyBlockRules([makeRule("example.com", { dailyLimit: 20 })])
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Schedule window enforcement
// ---------------------------------------------------------------------------

function makeSchedule(timeLimitId: string, overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "sched-1",
    timeLimitId,
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: [1, 2, 3, 4, 5], // Mon–Fri
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// Wednesday 2026-06-03
const WED_NOON = new Date(2026, 5, 3, 12, 0)
const WED_LATE_NIGHT = new Date(2026, 5, 3, 22, 0)
// Saturday 2026-06-06
const SAT_NOON = new Date(2026, 5, 6, 12, 0)

describe("applyBlockRules – a scheduled rule only blocks during its window", () => {
  it("blocks the domain when now falls inside the schedule's day/time window", async () => {
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: null })
    await applyBlockRules([rule], [makeSchedule("tl-1")], WED_NOON)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(1)
  })

  it("does not block the domain when now falls outside the schedule's time window", async () => {
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: null })
    await applyBlockRules([rule], [makeSchedule("tl-1")], WED_LATE_NIGHT)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })

  it("does not block the domain when now falls on a day not in daysOfWeek", async () => {
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: null })
    await applyBlockRules([rule], [makeSchedule("tl-1")], SAT_NOON)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })

  it("does not block outside the window even when the rule has no dailyLimit (unconditional block is scoped by the schedule)", async () => {
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: null })
    await applyBlockRules([rule], [makeSchedule("tl-1")], WED_LATE_NIGHT)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })

  it("blocks when any one of several schedules on the rule matches", async () => {
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: null })
    const schedules = [
      makeSchedule("tl-1", { daysOfWeek: [6] }), // Saturday only
      makeSchedule("tl-1", { daysOfWeek: [1, 2, 3, 4, 5] }), // weekdays
    ]
    await applyBlockRules([rule], schedules, WED_NOON)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(1)
  })

  it("ignores schedules belonging to a different rule's timeLimitId", async () => {
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: null })
    const otherRulesSchedule = makeSchedule("tl-other")
    await applyBlockRules([rule], [otherRulesSchedule], WED_NOON)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    // tl-1 has no schedules of its own, so it falls back to unconditional dailyLimit===null blocking
    expect(addRules).toHaveLength(1)
  })

  it("a rule with no schedules at all is unaffected by time of day (existing dailyLimit-only behaviour)", async () => {
    mockStorageGet.mockResolvedValue({})
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: 20 })
    await applyBlockRules([rule], [], WED_LATE_NIGHT)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0) // no usage recorded yet, so still under budget
  })
})

describe("applyBlockRules – schedule window combined with dailyLimit budget", () => {
  it("does not block inside the window when usage is still under the dailyLimit", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: todayKey(WED_NOON), minutesUsed: 5 } },
    })
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: 20 })
    await applyBlockRules([rule], [makeSchedule("tl-1")], WED_NOON)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })

  it("blocks inside the window once the dailyLimit budget is exhausted", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: todayKey(WED_NOON), minutesUsed: 20 } },
    })
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: 20 })
    await applyBlockRules([rule], [makeSchedule("tl-1")], WED_NOON)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(1)
  })

  it("does not block outside the window even when the dailyLimit budget is exhausted", async () => {
    mockStorageGet.mockResolvedValue({
      dailyUsage: { "example.com": { date: todayKey(WED_LATE_NIGHT), minutesUsed: 999 } },
    })
    const rule = makeRule("example.com", { id: "tl-1", dailyLimit: 20 })
    await applyBlockRules([rule], [makeSchedule("tl-1")], WED_LATE_NIGHT)
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })
})

function todayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
