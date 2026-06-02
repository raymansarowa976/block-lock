import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SyncPayload } from "@block-lock/shared-types"
import { applyBlockRules } from "../src/rule-engine"

const mockGetDynamicRules = vi.fn()
const mockUpdateDynamicRules = vi.fn()
const mockStorageSet = vi.fn()

vi.stubGlobal("chrome", {
  declarativeNetRequest: {
    getDynamicRules: mockGetDynamicRules,
    updateDynamicRules: mockUpdateDynamicRules,
    RuleActionType: { BLOCK: "block" },
    ResourceType: { MAIN_FRAME: "main_frame" },
  },
  storage: {
    local: { set: mockStorageSet },
  },
})

beforeEach(() => {
  mockGetDynamicRules.mockReset().mockResolvedValue([])
  mockUpdateDynamicRules.mockReset().mockResolvedValue(undefined)
  mockStorageSet.mockReset().mockResolvedValue(undefined)
})

function makePayload(overrides: Partial<SyncPayload> = {}): SyncPayload {
  return {
    userId: "user-123",
    rules: [],
    schedules: [],
    syncedAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  }
}

function makeRule(domain: string, isActive = true) {
  return {
    id: "rid-1",
    userId: "user-123",
    domain,
    isActive,
    dailyLimit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// ---------------------------------------------------------------------------
// Rule structure
// ---------------------------------------------------------------------------

describe("applyBlockRules – rule structure passed to updateDynamicRules", () => {
  it("calls updateDynamicRules with a urlFilter derived from the domain", async () => {
    await applyBlockRules(makePayload({ rules: [makeRule("example.com")] }))
    expect(mockUpdateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({
        addRules: expect.arrayContaining([
          expect.objectContaining({ condition: expect.objectContaining({ urlFilter: "||example.com^" }) }),
        ]),
      }),
    )
  })

  it("assigns sequential ids starting at 1", async () => {
    await applyBlockRules(makePayload({
      rules: [makeRule("a.com"), makeRule("b.com")],
    }))
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules.map((r: { id: number }) => r.id)).toEqual([1, 2])
  })

  it("sets priority to 1 on every rule", async () => {
    await applyBlockRules(makePayload({ rules: [makeRule("a.com")] }))
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].priority).toBe(1)
  })

  it("sets action type to the declarativeNetRequest BLOCK enum value", async () => {
    await applyBlockRules(makePayload({ rules: [makeRule("a.com")] }))
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].action.type).toBe("block")
  })

  it("sets resourceTypes to [MAIN_FRAME]", async () => {
    await applyBlockRules(makePayload({ rules: [makeRule("a.com")] }))
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].condition.resourceTypes).toEqual(["main_frame"])
  })
})

// ---------------------------------------------------------------------------
// Existing rule removal
// ---------------------------------------------------------------------------

describe("applyBlockRules – existing rule cleanup", () => {
  it("fetches existing dynamic rules before updating", async () => {
    await applyBlockRules(makePayload())
    expect(mockGetDynamicRules).toHaveBeenCalled()
  })

  it("passes existing rule ids as removeRuleIds", async () => {
    mockGetDynamicRules.mockResolvedValue([{ id: 7 }, { id: 8 }])
    await applyBlockRules(makePayload({ rules: [makeRule("a.com")] }))
    expect(mockUpdateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({ removeRuleIds: [7, 8] }),
    )
  })

  it("passes an empty removeRuleIds when there are no existing rules", async () => {
    mockGetDynamicRules.mockResolvedValue([])
    await applyBlockRules(makePayload({ rules: [makeRule("a.com")] }))
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
    await applyBlockRules(makePayload({
      rules: [makeRule("blocked.com", true), makeRule("skipped.com", false)],
    }))
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(1)
    expect(addRules[0].condition.urlFilter).toBe("||blocked.com^")
  })

  it("excludes domains that cannot be sanitised (e.g. plain words)", async () => {
    await applyBlockRules(makePayload({ rules: [makeRule("not a domain")] }))
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules).toHaveLength(0)
  })

  it("sanitises a protocol-prefixed domain before building the urlFilter", async () => {
    await applyBlockRules(makePayload({ rules: [makeRule("https://example.com/path")] }))
    const { addRules } = mockUpdateDynamicRules.mock.calls[0][0]
    expect(addRules[0].condition.urlFilter).toBe("||example.com^")
  })
})

// ---------------------------------------------------------------------------
// Post-apply storage update
// ---------------------------------------------------------------------------

describe("applyBlockRules – lastSync", () => {
  it("writes lastSync to storage after applying rules", async () => {
    await applyBlockRules(makePayload())
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastSync: expect.any(String) }),
    )
  })
})