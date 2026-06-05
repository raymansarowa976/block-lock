import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Stable pipeline mock — created before vi.mock() runs so the factory can
// reference it. vi.hoisted() guarantees execution before any import or mock.
// ---------------------------------------------------------------------------

const { mockPipeline } = vi.hoisted(() => {
  const mockPipeline = {
    zremrangebyscore: vi.fn(),
    zadd: vi.fn(),
    zcard: vi.fn(),
    pexpire: vi.fn(),
    exec: vi.fn(),
  }
  return { mockPipeline }
})

vi.mock("@/lib/redis", () => ({
  redis: {
    pipeline: vi.fn(() => mockPipeline),
  },
}))

import { rateLimit, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "@/lib/rate-limit"

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"

// Pipeline exec returns direct values — one per pipelined command (Upstash Redis format).
// Expected command order: zremrangebyscore, zadd, zcard, pexpire
function execResult(zcard: number): [number, number, number, number] {
  return [0, 1, zcard, 1]
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// rateLimit()
// ---------------------------------------------------------------------------

describe("rateLimit", () => {
  it("allows a request when the user is well under the limit", async () => {
    mockPipeline.exec.mockResolvedValue(execResult(1))

    const result = await rateLimit(USER_ID)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(RATE_LIMIT_MAX - 1)
  })

  it("allows the request when the count is exactly at the limit", async () => {
    mockPipeline.exec.mockResolvedValue(execResult(RATE_LIMIT_MAX))

    const result = await rateLimit(USER_ID)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it("blocks the request when the count exceeds the limit", async () => {
    mockPipeline.exec.mockResolvedValue(execResult(RATE_LIMIT_MAX + 1))

    const result = await rateLimit(USER_ID)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("creates a Redis pipeline and calls exec exactly once per invocation", async () => {
    mockPipeline.exec.mockResolvedValue(execResult(1))

    await rateLimit(USER_ID)

    expect(mockPipeline.exec).toHaveBeenCalledOnce()
  })

  it("scopes the Redis sorted-set key to the authenticated user", async () => {
    mockPipeline.exec.mockResolvedValue(execResult(1))

    await rateLimit(USER_ID)

    // Both the stale-entry cleanup and the insert must target the same user-scoped key
    expect(mockPipeline.zremrangebyscore.mock.calls[0][0]).toContain(USER_ID)
    expect(mockPipeline.zadd.mock.calls[0][0]).toContain(USER_ID)
  })

  it("removes only entries older than the sliding-window boundary", async () => {
    mockPipeline.exec.mockResolvedValue(execResult(1))
    const before = Date.now()

    await rateLimit(USER_ID)

    const after = Date.now()
    // zremrangebyscore(key, min, max) — max should equal (now − windowMs)
    const maxBound = mockPipeline.zremrangebyscore.mock.calls[0][2] as number
    expect(maxBound).toBeGreaterThanOrEqual(before - RATE_LIMIT_WINDOW_MS)
    expect(maxBound).toBeLessThanOrEqual(after - RATE_LIMIT_WINDOW_MS)
  })

  it("includes a resetAt timestamp approximately one window from now", async () => {
    mockPipeline.exec.mockResolvedValue(execResult(1))
    const before = Date.now()

    const result = await rateLimit(USER_ID)

    const after = Date.now()
    expect(result.resetAt).toBeGreaterThanOrEqual(before + RATE_LIMIT_WINDOW_MS)
    expect(result.resetAt).toBeLessThanOrEqual(after + RATE_LIMIT_WINDOW_MS)
  })
})