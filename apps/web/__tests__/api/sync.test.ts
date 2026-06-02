import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

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
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const SCHEDULE_ID = "clh3q5g0o0002qmij2z3m4n5k"
const CACHE_KEY = `user:rules:${USER_ID}`

function makeTimeLimit(overrides: Record<string, unknown> = {}) {
  return {
    id: LIMIT_ID,
    userId: USER_ID,
    domain: "example.com",
    dailyLimit: 30,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    schedules: [],
    ...overrides,
  }
}

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: SCHEDULE_ID,
    timeLimitId: LIMIT_ID,
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: [1, 2, 3, 4, 5],
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

const CACHED_PAYLOAD = JSON.stringify({
  userId: USER_ID,
  rules: [
    {
      id: LIMIT_ID,
      userId: USER_ID,
      domain: "example.com",
      dailyLimit: 30,
      isActive: true,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
  ],
  schedules: [],
  syncedAt: "2025-01-01T00:00:00.000Z",
})

function syncRequest(userId?: string) {
  const url = userId
    ? `http://localhost/api/sync?userId=${userId}`
    : "http://localhost/api/sync"
  return new Request(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/sync", () => {
  // ── Missing userId ──────────────────────────────────────────────────────────

  describe("missing userId", () => {
    it("returns 400 when userId query param is absent", async () => {
      const res = await GET(syncRequest())
      expect(res.status).toBe(400)
    })

    it("does not touch Redis when userId is missing", async () => {
      await GET(syncRequest())
      expect(mockGet).not.toHaveBeenCalled()
    })

    it("does not touch Prisma when userId is missing", async () => {
      await GET(syncRequest())
      expect(mockFindMany).not.toHaveBeenCalled()
    })
  })

  // ── Cache hit ───────────────────────────────────────────────────────────────

  describe("cache hit", () => {
    it("returns 200 immediately from the cache", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      const res = await GET(syncRequest(USER_ID))
      expect(res.status).toBe(200)
    })

    it("does not call Prisma on a cache hit", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      await GET(syncRequest(USER_ID))
      expect(mockFindMany).not.toHaveBeenCalled()
    })

    it("does not call Redis setex on a cache hit", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      await GET(syncRequest(USER_ID))
      expect(mockSetex).not.toHaveBeenCalled()
    })

    it("returns the cached payload content verbatim", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      const res = await GET(syncRequest(USER_ID))
      const body = await res.json()
      expect(body).toEqual(JSON.parse(CACHED_PAYLOAD))
    })

    it("looks up the cache under the user:rules:{userId} key pattern", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      await GET(syncRequest(USER_ID))
      expect(mockGet).toHaveBeenCalledWith(CACHE_KEY)
    })
  })

  // ── Cache miss ──────────────────────────────────────────────────────────────

  describe("cache miss", () => {
    beforeEach(() => {
      mockGet.mockResolvedValue(null)
    })

    it("queries Prisma when the cache key is absent", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(USER_ID))
      expect(mockFindMany).toHaveBeenCalledOnce()
    })

    it("queries only the specified userId's time limits", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(USER_ID))
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID }),
        }),
      )
    })

    it("includes the schedules relation in the Prisma query", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(USER_ID))
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ schedules: true }),
        }),
      )
    })

    it("writes the compiled payload to Redis after a cache miss", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(USER_ID))
      expect(mockSetex).toHaveBeenCalledOnce()
    })

    it("writes under the user:rules:{userId} key pattern", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(USER_ID))
      const [key] = mockSetex.mock.calls[0]
      expect(key).toBe(CACHE_KEY)
    })

    it("writes with a positive integer TTL in seconds", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(USER_ID))
      const [, ttl] = mockSetex.mock.calls[0]
      expect(Number.isInteger(ttl)).toBe(true)
      expect(ttl).toBeGreaterThan(0)
    })

    it("writes a valid JSON string to Redis", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(USER_ID))
      const [, , value] = mockSetex.mock.calls[0]
      expect(() => JSON.parse(value as string)).not.toThrow()
    })

    it("stores the userId inside the cached payload", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(USER_ID))
      const cached = JSON.parse(mockSetex.mock.calls[0][2] as string)
      expect(cached.userId).toBe(USER_ID)
    })

    it("returns 200 with the compiled payload", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      const res = await GET(syncRequest(USER_ID))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.userId).toBe(USER_ID)
    })

    it("includes the user's rules in the response", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      const res = await GET(syncRequest(USER_ID))
      const body = await res.json()
      expect(body.rules).toHaveLength(1)
      expect(body.rules[0]).toMatchObject({ domain: "example.com" })
    })

    it("flattens schedules from all time limits into the response", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit({ schedules: [makeSchedule()] })])
      const res = await GET(syncRequest(USER_ID))
      const body = await res.json()
      expect(body.schedules).toHaveLength(1)
      expect(body.schedules[0]).toMatchObject({ timeLimitId: LIMIT_ID })
    })
  })
})
