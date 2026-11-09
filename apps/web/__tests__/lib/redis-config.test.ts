// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { mockRedisInstance, MockRedis } = vi.hoisted(() => {
  const mockRedisInstance = { get: vi.fn(), set: vi.fn(), pipeline: vi.fn() }
  const MockRedis = vi.fn(function () { return mockRedisInstance })
  return { mockRedisInstance, MockRedis }
})

vi.mock("@upstash/redis", () => ({ Redis: MockRedis }))

describe("redis client — Upstash configuration", () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.resetModules()
    MockRedis.mockClear()
    delete (globalThis as unknown as { redis?: unknown }).redis
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it("initialises using @upstash/redis with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"

    await import("@/lib/redis")

    expect(MockRedis).toHaveBeenCalledOnce()
    expect(MockRedis).toHaveBeenCalledWith({
      url: "https://test.upstash.io",
      token: "test-token",
    })
  })

  it("exports the redis instance returned by the Upstash Redis constructor", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"

    const { redis } = await import("@/lib/redis")

    expect(redis).toBe(mockRedisInstance)
  })

  // Vercel's Upstash marketplace integration provisions the same database
  // under KV_REST_API_* names rather than UPSTASH_REDIS_REST_*.
  it("falls back to Vercel's KV_REST_API_URL and KV_REST_API_TOKEN when the Upstash vars are unset", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    process.env.KV_REST_API_URL = "https://kv.upstash.io"
    process.env.KV_REST_API_TOKEN = "kv-token"

    await import("@/lib/redis")

    expect(MockRedis).toHaveBeenCalledWith({
      url: "https://kv.upstash.io",
      token: "kv-token",
    })
  })

  it("prefers the UPSTASH_REDIS_REST_* vars when both naming schemes are set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
    process.env.KV_REST_API_URL = "https://kv.upstash.io"
    process.env.KV_REST_API_TOKEN = "kv-token"

    await import("@/lib/redis")

    expect(MockRedis).toHaveBeenCalledWith({
      url: "https://test.upstash.io",
      token: "test-token",
    })
  })

  it("does not fall back to a raw TCP connection string when Upstash vars are present", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
    delete process.env.REDIS_URL

    await import("@/lib/redis")

    expect(MockRedis).toHaveBeenCalledWith(
      expect.not.objectContaining({ host: expect.anything() }),
    )
  })
})