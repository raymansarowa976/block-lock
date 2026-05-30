import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
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

import { auth } from "@/auth"
import { redis } from "@/lib/redis"
import { prisma } from "@/lib/prisma"
import { GET } from "@/app/api/sync/route"

const mockAuth = auth as unknown as Mock
const mockGet = redis.get as unknown as Mock
const mockSetex = redis.setex as unknown as Mock
const mockFindMany = (
  prisma as unknown as { timeLimit: { findMany: Mock } }
).timeLimit.findMany

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const SCHEDULE_ID = "clh3q5g0o0002qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }
const CACHE_KEY = `user:rules:${USER_ID}`

// Factory for a Prisma TimeLimit row (with schedules relation attached)
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

// Simulates a Redis cache entry: what the route would have written on a prior
// cache-miss. Dates are ISO strings because JSON.stringify converts them.
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

function syncRequest() {
  return new Request("http://localhost/api/sync")
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET /api/sync
// ---------------------------------------------------------------------------

describe("GET /api/sync", () => {
  // ── Authentication ────────────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 when the request is unauthenticated", async () => {
      mockAuth.mockResolvedValue(null)

      const res = await GET(syncRequest())

      expect(res.status).toBe(401)
    })

    it("does not touch Redis when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null)

      await GET(syncRequest())

      expect(mockGet).not.toHaveBeenCalled()
    })

    it("does not touch Prisma when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null)

      await GET(syncRequest())

      expect(mockFindMany).not.toHaveBeenCalled()
    })
  })

  // ── Cache hit ─────────────────────────────────────────────────────────────

  describe("cache hit", () => {
    it("returns 200 immediately from the cache", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockGet.mockResolvedValue(CACHED_PAYLOAD)

      const res = await GET(syncRequest())

      expect(res.status).toBe(200)
    })

    it("does not call Prisma on a cache hit", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockGet.mockResolvedValue(CACHED_PAYLOAD)

      await GET(syncRequest())

      expect(mockFindMany).not.toHaveBeenCalled()
    })

    it("does not call Redis setex on a cache hit", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockGet.mockResolvedValue(CACHED_PAYLOAD)

      await GET(syncRequest())

      expect(mockSetex).not.toHaveBeenCalled()
    })

    it("returns the cached payload content verbatim", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockGet.mockResolvedValue(CACHED_PAYLOAD)

      const res = await GET(syncRequest())
      const body = await res.json()

      expect(body).toEqual(JSON.parse(CACHED_PAYLOAD))
    })

    it("looks up the cache under the user:rules:{userId} key pattern", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockGet.mockResolvedValue(CACHED_PAYLOAD)

      await GET(syncRequest())

      expect(mockGet).toHaveBeenCalledWith(CACHE_KEY)
    })
  })

  // ── Cache miss ────────────────────────────────────────────────────────────

  describe("cache miss", () => {
    beforeEach(() => {
      mockGet.mockResolvedValue(null)
    })

    it("queries Prisma when the cache key is absent", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      await GET(syncRequest())

      expect(mockFindMany).toHaveBeenCalledOnce()
    })

    it("queries only the authenticated user's time limits", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      await GET(syncRequest())

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID }),
        }),
      )
    })

    it("includes the schedules relation in the Prisma query", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      await GET(syncRequest())

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ schedules: true }),
        }),
      )
    })

    it("writes the compiled payload to Redis after a cache miss", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      await GET(syncRequest())

      expect(mockSetex).toHaveBeenCalledOnce()
    })

    it("writes under the user:rules:{userId} key pattern", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      await GET(syncRequest())

      const [key] = mockSetex.mock.calls[0]
      expect(key).toBe(CACHE_KEY)
    })

    it("writes with a positive integer TTL in seconds", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      await GET(syncRequest())

      const [, ttl] = mockSetex.mock.calls[0]
      expect(Number.isInteger(ttl)).toBe(true)
      expect(ttl).toBeGreaterThan(0)
    })

    it("writes a valid JSON string to Redis", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      await GET(syncRequest())

      const [, , value] = mockSetex.mock.calls[0]
      expect(() => JSON.parse(value as string)).not.toThrow()
    })

    it("stores the userId inside the cached payload", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      await GET(syncRequest())

      const cached = JSON.parse(mockSetex.mock.calls[0][2] as string)
      expect(cached.userId).toBe(USER_ID)
    })

    it("returns 200 with the compiled payload", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      const res = await GET(syncRequest())

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.userId).toBe(USER_ID)
    })

    it("includes the user's rules in the response", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit()])

      const res = await GET(syncRequest())
      const body = await res.json()

      expect(body.rules).toHaveLength(1)
      expect(body.rules[0]).toMatchObject({ domain: "example.com" })
    })

    it("flattens schedules from all time limits into the response", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockFindMany.mockResolvedValue([makeTimeLimit({ schedules: [makeSchedule()] })])

      const res = await GET(syncRequest())
      const body = await res.json()

      expect(body.schedules).toHaveLength(1)
      expect(body.schedules[0]).toMatchObject({ timeLimitId: LIMIT_ID })
    })
  })
})