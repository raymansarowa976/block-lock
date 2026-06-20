import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { usageLog: { findMany: vi.fn() } },
}))

import { prisma } from "@/lib/prisma"
import {
  TRAILING_WINDOW_DAYS,
  MICRO_RELAPSE_WINDOW_MINUTES,
  computeDomainAggregates,
  aggregateWeeklyUsage,
} from "@/lib/insights/aggregate-usage"

const mockFindMany = (prisma as unknown as { usageLog: { findMany: Mock } }).usageLog.findMany

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"

function log(overrides: Partial<{ domain: string; duration: number; blockedAt: Date | null; loggedAt: Date }>) {
  return {
    domain: "example.com",
    duration: 60,
    blockedAt: null,
    loggedAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// computeDomainAggregates – pure aggregation math
// ---------------------------------------------------------------------------

describe("computeDomainAggregates", () => {
  it("returns an empty array for no logs", () => {
    expect(computeDomainAggregates([])).toEqual([])
  })

  it("sums duration into whole minutes per domain", () => {
    const logs = [
      log({ domain: "youtube.com", duration: 90 }),
      log({ domain: "youtube.com", duration: 30 }),
    ]

    const [aggregate] = computeDomainAggregates(logs)

    expect(aggregate.domain).toBe("youtube.com")
    expect(aggregate.totalMinutes).toBe(2)
  })

  it("counts sessions and blocked sessions independently", () => {
    const logs = [
      log({ domain: "x.com", blockedAt: null }),
      log({ domain: "x.com", blockedAt: new Date("2026-06-01T00:05:00Z") }),
      log({ domain: "x.com", blockedAt: new Date("2026-06-01T00:10:00Z") }),
    ]

    const [aggregate] = computeDomainAggregates(logs)

    expect(aggregate.sessionCount).toBe(3)
    expect(aggregate.blockedCount).toBe(2)
  })

  it("groups separate domains into separate aggregates", () => {
    const logs = [log({ domain: "a.com" }), log({ domain: "b.com" })]

    const aggregates = computeDomainAggregates(logs)

    expect(aggregates.map((a) => a.domain).sort()).toEqual(["a.com", "b.com"])
  })

  it("counts a session as a micro-relapse when it follows a block within the relapse window", () => {
    const blockedAt = new Date("2026-06-01T00:00:00Z")
    const logs = [
      log({ domain: "tiktok.com", blockedAt, loggedAt: blockedAt }),
      log({
        domain: "tiktok.com",
        blockedAt: null,
        loggedAt: new Date(blockedAt.getTime() + 10 * 60_000),
      }),
    ]

    const [aggregate] = computeDomainAggregates(logs)

    expect(aggregate.microRelapses).toBe(1)
  })

  it("does not count a session as a micro-relapse once it falls outside the relapse window", () => {
    const blockedAt = new Date("2026-06-01T00:00:00Z")
    const logs = [
      log({ domain: "tiktok.com", blockedAt, loggedAt: blockedAt }),
      log({
        domain: "tiktok.com",
        blockedAt: null,
        loggedAt: new Date(blockedAt.getTime() + (MICRO_RELAPSE_WINDOW_MINUTES + 1) * 60_000),
      }),
    ]

    const [aggregate] = computeDomainAggregates(logs)

    expect(aggregate.microRelapses).toBe(0)
  })

  it("does not let blocked sessions on one domain trigger relapses on another", () => {
    const blockedAt = new Date("2026-06-01T00:00:00Z")
    const logs = [
      log({ domain: "tiktok.com", blockedAt, loggedAt: blockedAt }),
      log({
        domain: "instagram.com",
        blockedAt: null,
        loggedAt: new Date(blockedAt.getTime() + 5 * 60_000),
      }),
    ]

    const aggregates = computeDomainAggregates(logs)
    const instagram = aggregates.find((a) => a.domain === "instagram.com")

    expect(instagram?.microRelapses).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// aggregateWeeklyUsage – Prisma query + summary shape
// ---------------------------------------------------------------------------

describe("aggregateWeeklyUsage", () => {
  it("queries usage logs scoped to the user across a trailing 7-day window", async () => {
    await aggregateWeeklyUsage(USER_ID)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          loggedAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    )

    const [[{ where }]] = mockFindMany.mock.calls
    const spanMs = where.loggedAt.lte.getTime() - where.loggedAt.gte.getTime()
    expect(Math.round(spanMs / (24 * 60 * 60 * 1000))).toBe(TRAILING_WINDOW_DAYS)
  })

  it("returns a summary containing the userId, ISO period bounds, and per-domain aggregates", async () => {
    mockFindMany.mockResolvedValue([log({ domain: "youtube.com", duration: 120 })])

    const summary = await aggregateWeeklyUsage(USER_ID)

    expect(summary.userId).toBe(USER_ID)
    expect(() => new Date(summary.periodStart).toISOString()).not.toThrow()
    expect(() => new Date(summary.periodEnd).toISOString()).not.toThrow()
    expect(summary.domains).toEqual([
      expect.objectContaining({ domain: "youtube.com", totalMinutes: 2, sessionCount: 1 }),
    ])
  })
})
