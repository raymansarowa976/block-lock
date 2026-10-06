import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    usageLog: { findMany: vi.fn() },
    productivityInsight: { create: vi.fn() },
  },
}))
vi.mock("@/lib/insights/aggregate-usage", () => ({ aggregateWeeklyUsage: vi.fn(), TRAILING_WINDOW_DAYS: 7 }))
vi.mock("@/lib/ai/productivity-coach", () => ({ generateProductivityInsight: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { aggregateWeeklyUsage } from "@/lib/insights/aggregate-usage"
import { generateProductivityInsight } from "@/lib/ai/productivity-coach"
import { GET } from "@/app/api/cron/insights/route"

const mockFindMany = (prisma as unknown as { usageLog: { findMany: Mock } }).usageLog.findMany
const mockCreate = (prisma as unknown as { productivityInsight: { create: Mock } }).productivityInsight.create
const mockAggregate = aggregateWeeklyUsage as unknown as Mock
const mockGenerate = generateProductivityInsight as unknown as Mock

const CRON_SECRET = "test-cron-secret"

const USER_A = "clh3q5g0o0000qmij2z3m4n5k"
const USER_B = "clh3q5g0o0001qmij2z3m4n5l"

function authedRequest() {
  return new Request("http://localhost/api/cron/insights", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

function summaryFor(userId: string, domains: number) {
  return {
    userId,
    periodStart: "2026-05-31T00:00:00.000Z",
    periodEnd: "2026-06-07T00:00:00.000Z",
    domains: Array.from({ length: domains }, (_, i) => ({
      domain: `domain-${i}.com`,
      totalMinutes: 60,
      sessionCount: 5,
      blockedCount: 1,
      microRelapses: 1,
    })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("CRON_SECRET", CRON_SECRET)
  mockFindMany.mockResolvedValue([])
  mockAggregate.mockResolvedValue(summaryFor(USER_A, 1))
  mockGenerate.mockResolvedValue("## Weekly briefing")
  mockCreate.mockResolvedValue({ id: "insight-1" })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("GET /api/cron/insights – authorization", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const res = await GET(new Request("http://localhost/api/cron/insights"))
    expect(res.status).toBe(401)
  })

  it("returns 401 when the bearer token does not match CRON_SECRET", async () => {
    const res = await GET(
      new Request("http://localhost/api/cron/insights", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    )
    expect(res.status).toBe(401)
  })

  it("does not touch the database for unauthorized requests", async () => {
    await GET(new Request("http://localhost/api/cron/insights"))
    expect(mockFindMany).not.toHaveBeenCalled()
    expect(mockAggregate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Aggregation + generation pipeline
// ---------------------------------------------------------------------------

describe("GET /api/cron/insights – pipeline", () => {
  it("discovers distinct users with usage activity in the trailing window", async () => {
    mockFindMany.mockResolvedValue([{ userId: USER_A }, { userId: USER_B }])
    mockAggregate.mockResolvedValueOnce(summaryFor(USER_A, 2)).mockResolvedValueOnce(summaryFor(USER_B, 1))

    await GET(authedRequest())

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ loggedAt: expect.objectContaining({ gte: expect.any(Date) }) }),
        distinct: ["userId"],
      }),
    )
  })

  it("aggregates usage and generates an insight for each active user", async () => {
    mockFindMany.mockResolvedValue([{ userId: USER_A }, { userId: USER_B }])
    mockAggregate.mockResolvedValueOnce(summaryFor(USER_A, 2)).mockResolvedValueOnce(summaryFor(USER_B, 1))

    await GET(authedRequest())

    expect(mockAggregate).toHaveBeenCalledWith(USER_A)
    expect(mockAggregate).toHaveBeenCalledWith(USER_B)
    expect(mockGenerate).toHaveBeenCalledTimes(2)
  })

  it("persists each generated insight scoped to its user and period", async () => {
    mockFindMany.mockResolvedValue([{ userId: USER_A }])
    mockAggregate.mockResolvedValue(summaryFor(USER_A, 1))
    mockGenerate.mockResolvedValue("## Briefing for A")

    await GET(authedRequest())

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_A,
        periodStart: new Date("2026-05-31T00:00:00.000Z"),
        periodEnd: new Date("2026-06-07T00:00:00.000Z"),
        summary: "## Briefing for A",
      },
    })
  })

  it("skips users whose trailing window has no domain activity", async () => {
    mockFindMany.mockResolvedValue([{ userId: USER_A }])
    mockAggregate.mockResolvedValue(summaryFor(USER_A, 0))

    await GET(authedRequest())

    expect(mockGenerate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("continues processing remaining users when one user's pipeline fails", async () => {
    mockFindMany.mockResolvedValue([{ userId: USER_A }, { userId: USER_B }])
    mockAggregate
      .mockRejectedValueOnce(new Error("aggregation failed"))
      .mockResolvedValueOnce(summaryFor(USER_B, 1))

    const res = await GET(authedRequest())

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
  })

  it("returns 200 with the number of insights generated", async () => {
    mockFindMany.mockResolvedValue([{ userId: USER_A }, { userId: USER_B }])
    mockAggregate.mockResolvedValueOnce(summaryFor(USER_A, 2)).mockResolvedValueOnce(summaryFor(USER_B, 1))

    const res = await GET(authedRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ processed: 2 })
  })
})
