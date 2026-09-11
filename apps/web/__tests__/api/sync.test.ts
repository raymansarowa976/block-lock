import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    timeLimit: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/sync-token", () => ({ verifySyncToken: vi.fn() }))

import { redis } from "@/lib/redis"
import { prisma } from "@/lib/prisma"
import { verifySyncToken } from "@/lib/sync-token"
import { GET, OPTIONS } from "@/app/api/sync/route"

const mockGet = redis.get as unknown as Mock
const mockSet = redis.set as unknown as Mock
const mockFindMany = (
  prisma as unknown as { timeLimit: { findMany: Mock } }
).timeLimit.findMany
const mockVerify = verifySyncToken as unknown as Mock

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const SCHEDULE_ID = "clh3q5g0o0002qmij2z3m4n5k"
const CACHE_KEY = `user:rules:${USER_ID}`
const VALID_TOKEN = "valid.token"

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

// @upstash/redis automatically deserializes JSON, so redis.get() resolves
// with the parsed object rather than a raw string.
const CACHED_PAYLOAD = {
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
}

const EXTENSION_ID = "ldlmnamnojhcjjnfoodglmcnaedagljl"
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

function syncRequest(token?: string, origin?: string) {
  const url = token
    ? `http://localhost/api/sync?token=${token}`
    : "http://localhost/api/sync"
  const headers = new Headers()
  if (origin) headers.set("origin", origin)
  return new Request(url, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_EXTENSION_ID = EXTENSION_ID
  mockVerify.mockImplementation((token: string) =>
    token === VALID_TOKEN ? { userId: USER_ID } : null,
  )
})

describe("GET /api/sync", () => {
  // ── Missing / invalid token ─────────────────────────────────────────────────

  describe("missing token", () => {
    it("returns 400 when token query param is absent", async () => {
      const res = await GET(syncRequest())
      expect(res.status).toBe(400)
    })

    it("does not touch Redis when token is missing", async () => {
      await GET(syncRequest())
      expect(mockGet).not.toHaveBeenCalled()
    })

    it("does not touch Prisma when token is missing", async () => {
      await GET(syncRequest())
      expect(mockFindMany).not.toHaveBeenCalled()
    })
  })

  describe("invalid or expired token", () => {
    it("returns 401 when the token fails verification", async () => {
      const res = await GET(syncRequest("garbage"))
      expect(res.status).toBe(401)
    })

    it("does not touch Redis when the token is invalid", async () => {
      await GET(syncRequest("garbage"))
      expect(mockGet).not.toHaveBeenCalled()
    })

    it("does not touch Prisma when the token is invalid", async () => {
      await GET(syncRequest("garbage"))
      expect(mockFindMany).not.toHaveBeenCalled()
    })

    it("never trusts a raw userId passed instead of a token", async () => {
      // Regression guard: a bare cuid must not verify as a token.
      const res = await GET(syncRequest(USER_ID))
      expect(res.status).toBe(401)
    })
  })

  // ── Cache hit ───────────────────────────────────────────────────────────────

  describe("cache hit", () => {
    it("returns 200 immediately from the cache", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      const res = await GET(syncRequest(VALID_TOKEN))
      expect(res.status).toBe(200)
    })

    it("does not call Prisma on a cache hit", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      await GET(syncRequest(VALID_TOKEN))
      expect(mockFindMany).not.toHaveBeenCalled()
    })

    it("does not call Redis set on a cache hit", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      await GET(syncRequest(VALID_TOKEN))
      expect(mockSet).not.toHaveBeenCalled()
    })

    it("returns the cached payload content verbatim", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      const res = await GET(syncRequest(VALID_TOKEN))
      const body = await res.json()
      expect(body).toEqual(CACHED_PAYLOAD)
    })

    it("looks up the cache under the user:rules:{userId} key pattern derived from the token", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      await GET(syncRequest(VALID_TOKEN))
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
      await GET(syncRequest(VALID_TOKEN))
      expect(mockFindMany).toHaveBeenCalledOnce()
    })

    it("queries only the token-verified userId's time limits", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(VALID_TOKEN))
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID }),
        }),
      )
    })

    it("includes the schedules relation in the Prisma query", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(VALID_TOKEN))
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ schedules: true }),
        }),
      )
    })

    it("writes the compiled payload to Redis after a cache miss", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(VALID_TOKEN))
      expect(mockSet).toHaveBeenCalledOnce()
    })

    it("writes under the user:rules:{userId} key pattern", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(VALID_TOKEN))
      const [key] = mockSet.mock.calls[0]
      expect(key).toBe(CACHE_KEY)
    })

    it("writes with a positive integer TTL in seconds", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(VALID_TOKEN))
      const [, , { ex: ttl }] = mockSet.mock.calls[0]
      expect(Number.isInteger(ttl)).toBe(true)
      expect(ttl).toBeGreaterThan(0)
    })

    it("writes a plain serializable payload object to Redis", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(VALID_TOKEN))
      const [, value] = mockSet.mock.calls[0]
      expect(() => JSON.stringify(value)).not.toThrow()
      expect(typeof value).toBe("object")
    })

    it("stores the userId inside the cached payload", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      await GET(syncRequest(VALID_TOKEN))
      const cached = mockSet.mock.calls[0][1] as { userId: string }
      expect(cached.userId).toBe(USER_ID)
    })

    it("returns 200 with the compiled payload", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      const res = await GET(syncRequest(VALID_TOKEN))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.userId).toBe(USER_ID)
    })

    it("includes the user's rules in the response", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit()])
      const res = await GET(syncRequest(VALID_TOKEN))
      const body = await res.json()
      expect(body.rules).toHaveLength(1)
      expect(body.rules[0]).toMatchObject({ domain: "example.com" })
    })

    it("flattens schedules from all time limits into the response", async () => {
      mockFindMany.mockResolvedValue([makeTimeLimit({ schedules: [makeSchedule()] })])
      const res = await GET(syncRequest(VALID_TOKEN))
      const body = await res.json()
      expect(body.schedules).toHaveLength(1)
      expect(body.schedules[0]).toMatchObject({ timeLimitId: LIMIT_ID })
    })
  })

  // ── CORS (chrome-extension origin) ──────────────────────────────────────────

  describe("CORS – extension origin handling", () => {
    it("echoes the extension origin in Access-Control-Allow-Origin", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      const res = await GET(syncRequest(VALID_TOKEN, EXTENSION_ORIGIN))
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
    })

    it("does not set Access-Control-Allow-Origin for an unrelated origin", async () => {
      mockGet.mockResolvedValue(CACHED_PAYLOAD)
      const res = await GET(syncRequest(VALID_TOKEN, "https://evil.com"))
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
    })

    it("sets CORS headers on a 401 response too, so the extension can read the rejection", async () => {
      const res = await GET(syncRequest("garbage", EXTENSION_ORIGIN))
      expect(res.status).toBe(401)
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
    })

    it("responds to an OPTIONS preflight from the extension origin with 204 and CORS headers", async () => {
      const headers = new Headers()
      headers.set("origin", EXTENSION_ORIGIN)
      const res = await OPTIONS(new Request("http://localhost/api/sync", { method: "OPTIONS", headers }))
      expect(res.status).toBe(204)
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
    })
  })
})
