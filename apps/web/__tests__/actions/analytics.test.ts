import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/redis", () => ({ redis: { del: vi.fn() } }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    usageLog: { findMany: vi.fn() },
  },
}))

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getAnalyticsData, type Scope } from "@/lib/actions/analytics"

async function getSuccess(scope: Scope) {
  const result = await getAnalyticsData(scope)
  if (!result.success) throw new Error(result.error)
  return result
}

const mockAuth = auth as unknown as Mock
const mockFindMany = (
  prisma as unknown as { usageLog: { findMany: Mock } }
).usageLog.findMany

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

function makeLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    userId: USER_ID,
    timeLimitId: null,
    domain: "example.com",
    duration: 3600,
    blockedAt: null,
    loggedAt: new Date("2026-05-01T10:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// Authentication guard
// ---------------------------------------------------------------------------

describe("getAnalyticsData – authentication", () => {
  it("returns an error result when the session is absent", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await getAnalyticsData("week")
    expect(result.success).toBe(false)
    if (result.success) throw new Error("Expected failure")
    expect(result.error).toBeDefined()
  })

  it("does not query the database when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    await getAnalyticsData("week")
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Prisma query scoping
// ---------------------------------------------------------------------------

describe("getAnalyticsData – Prisma query scoping", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
  })

  it("scopes the usageLog query to the authenticated user", async () => {
    await getAnalyticsData("week")
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID }),
      }),
    )
  })

  it("applies a loggedAt gte filter based on the requested scope", async () => {
    await getAnalyticsData("week")
    const { where } = mockFindMany.mock.calls[0][0]
    expect(where.loggedAt?.gte).toBeInstanceOf(Date)
  })

  it("week scope sets the date cutoff approximately 7 days in the past", async () => {
    const before = Date.now()
    await getAnalyticsData("week")
    const { gte } = mockFindMany.mock.calls[0][0].where.loggedAt
    const diffMs = before - gte.getTime()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    expect(diffMs).toBeGreaterThanOrEqual(sevenDaysMs - 60_000)
    expect(diffMs).toBeLessThanOrEqual(sevenDaysMs + 60_000)
  })

  it("month scope sets the date cutoff approximately 30 days in the past", async () => {
    const before = Date.now()
    await getAnalyticsData("month")
    const { gte } = mockFindMany.mock.calls[0][0].where.loggedAt
    const diffMs = before - gte.getTime()
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    expect(diffMs).toBeGreaterThanOrEqual(thirtyDaysMs - 60_000)
    expect(diffMs).toBeLessThanOrEqual(thirtyDaysMs + 60_000)
  })

  it("day scope sets the date cutoff approximately 24 hours in the past", async () => {
    const before = Date.now()
    await getAnalyticsData("day")
    const { gte } = mockFindMany.mock.calls[0][0].where.loggedAt
    const diffMs = before - gte.getTime()
    const oneDayMs = 24 * 60 * 60 * 1000
    expect(diffMs).toBeGreaterThanOrEqual(oneDayMs - 60_000)
    expect(diffMs).toBeLessThanOrEqual(oneDayMs + 60_000)
  })
})

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe("getAnalyticsData – result shape", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
  })

  it("returns success: true with a data array on a valid call", async () => {
    mockFindMany.mockResolvedValue([makeLog()])
    const result = await getSuccess("week")
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  it("returns an empty data array when there are no usage logs", async () => {
    const result = await getSuccess("week")
    expect(result.data).toEqual([])
  })

  it("each data point has a date string, totalMinutes, and savedMinutes", async () => {
    mockFindMany.mockResolvedValue([makeLog()])
    const result = await getSuccess("week")
    const point = result.data[0]
    expect(typeof point.date).toBe("string")
    expect(typeof point.totalMinutes).toBe("number")
    expect(typeof point.savedMinutes).toBe("number")
  })
})

// ---------------------------------------------------------------------------
// Date grouping
// ---------------------------------------------------------------------------

describe("getAnalyticsData – date grouping", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
  })

  it("merges multiple logs from the same day into one data point", async () => {
    mockFindMany.mockResolvedValue([
      makeLog({ loggedAt: new Date("2026-05-01T09:00:00Z") }),
      makeLog({ loggedAt: new Date("2026-05-01T15:00:00Z") }),
    ])
    const result = await getSuccess("week")
    const may1Points = result.data.filter((p) => p.date.startsWith("2026-05-01"))
    expect(may1Points).toHaveLength(1)
  })

  it("produces separate data points for logs on different calendar days", async () => {
    mockFindMany.mockResolvedValue([
      makeLog({ loggedAt: new Date("2026-05-01T10:00:00Z") }),
      makeLog({ loggedAt: new Date("2026-05-02T10:00:00Z") }),
    ])
    const result = await getSuccess("week")
    expect(result.data).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Duration conversion and aggregation
// ---------------------------------------------------------------------------

describe("getAnalyticsData – totalMinutes", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
  })

  it("converts duration from seconds to minutes", async () => {
    mockFindMany.mockResolvedValue([makeLog({ duration: 3600 })])
    const result = await getSuccess("week")
    expect(result.data[0].totalMinutes).toBe(60)
  })

  it("sums durations across all logs on the same day", async () => {
    mockFindMany.mockResolvedValue([
      makeLog({ loggedAt: new Date("2026-05-01T09:00:00Z"), duration: 1800 }), // 30 min
      makeLog({ loggedAt: new Date("2026-05-01T14:00:00Z"), duration: 900 }),  // 15 min
    ])
    const result = await getSuccess("week")
    expect(result.data[0].totalMinutes).toBe(45)
  })
})

// ---------------------------------------------------------------------------
// savedMinutes from blocked visits
// ---------------------------------------------------------------------------

describe("getAnalyticsData – savedMinutes", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
  })

  it("counts blocked-visit duration as savedMinutes", async () => {
    mockFindMany.mockResolvedValue([
      makeLog({ duration: 1200, blockedAt: new Date() }), // 20 min blocked
    ])
    const result = await getSuccess("week")
    expect(result.data[0].savedMinutes).toBe(20)
  })

  it("does not count unblocked visits in savedMinutes", async () => {
    mockFindMany.mockResolvedValue([
      makeLog({ duration: 1200, blockedAt: null }),
    ])
    const result = await getSuccess("week")
    expect(result.data[0].savedMinutes).toBe(0)
  })

  it("correctly partitions blocked and unblocked duration on the same day", async () => {
    mockFindMany.mockResolvedValue([
      makeLog({ loggedAt: new Date("2026-05-01T09:00:00Z"), duration: 1800, blockedAt: new Date() }), // 30 min saved
      makeLog({ loggedAt: new Date("2026-05-01T14:00:00Z"), duration: 3600, blockedAt: null }),        // 60 min not saved
    ])
    const result = await getSuccess("week")
    const point = result.data[0]
    expect(point.totalMinutes).toBe(90)
    expect(point.savedMinutes).toBe(30)
  })
})
