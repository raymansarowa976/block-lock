import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

// Dedicated isolation suite — proves that a cache hit on /api/sync is served
// exclusively from Redis and that Prisma is never engaged under any circumstance.

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    timeLimit: { findMany: vi.fn() },
  },
}))

import { redis } from "@/lib/redis"
import { prisma } from "@/lib/prisma"
import { GET } from "@/app/api/sync/route"

const mockGet = redis.get as unknown as Mock
const mockSetex = redis.setex as unknown as Mock
const mockFindMany = (
  prisma as unknown as { timeLimit: { findMany: Mock } }
).timeLimit.findMany

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"

// Redis holds rule for "redis-domain.com"
const REDIS_PAYLOAD = JSON.stringify({
  userId: USER_ID,
  rules: [{
    id: "clh3q5g0o0001qmij2z3m4n5k",
    userId: USER_ID,
    domain: "redis-domain.com",
    dailyLimit: 30,
    isActive: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  }],
  schedules: [],
  syncedAt: "2025-01-01T00:00:00.000Z",
})

// Prisma would return a different rule for "prisma-domain.com"
const PRISMA_RULES = [{
  id: "clh3q5g0o0002qmij2z3m4n5k",
  userId: USER_ID,
  domain: "prisma-domain.com",
  dailyLimit: 60,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  schedules: [],
}]

function syncRequest() {
  return new Request(`http://localhost/api/sync?userId=${USER_ID}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue(PRISMA_RULES)
})

// ---------------------------------------------------------------------------
// Redis is the sole data source on a cache hit
// ---------------------------------------------------------------------------

describe("/api/sync – cache hit serves Redis exclusively", () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(REDIS_PAYLOAD)
  })

  it("calls redis.get exactly once per request", async () => {
    await GET(syncRequest())
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it("queries Redis under the user:rules:{userId} key", async () => {
    await GET(syncRequest())
    expect(mockGet).toHaveBeenCalledWith(`user:rules:${USER_ID}`)
  })

  it("never calls prisma.timeLimit.findMany", async () => {
    await GET(syncRequest())
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("never calls redis.setex (no cache write on a hit)", async () => {
    await GET(syncRequest())
    expect(mockSetex).not.toHaveBeenCalled()
  })

  it("serves the Redis payload even when Prisma would return different data", async () => {
    const res = await GET(syncRequest())
    const body = await res.json()
    expect(body.rules[0].domain).toBe("redis-domain.com")
    expect(body.rules.some((r: { domain: string }) => r.domain === "prisma-domain.com")).toBe(false)
  })

  it("returns the complete payload structure intact from Redis", async () => {
    const res = await GET(syncRequest())
    const body = await res.json()
    expect(body).toHaveProperty("userId", USER_ID)
    expect(body).toHaveProperty("rules")
    expect(body).toHaveProperty("schedules")
    expect(body).toHaveProperty("syncedAt")
  })

  it("two sequential cache hit requests both go to Redis only — Prisma stays silent", async () => {
    await GET(syncRequest())
    await GET(syncRequest())
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockFindMany).toHaveBeenCalledTimes(0)
  })
})