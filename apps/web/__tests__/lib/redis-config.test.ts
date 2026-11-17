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

  // Connecting the integration with a custom prefix (e.g. "UPSTASH_REDIS_REST_")
  // provisions <PREFIX>KV_REST_API_URL / <PREFIX>KV_REST_API_TOKEN instead.
  // Missing these made every /api/sync request fail with a 500 in production.
  describe("Vercel integration connected with a custom prefix", () => {
    function clearExactNames() {
      delete process.env.UPSTASH_REDIS_REST_URL
      delete process.env.UPSTASH_REDIS_REST_TOKEN
      delete process.env.KV_REST_API_URL
      delete process.env.KV_REST_API_TOKEN
    }

    it("uses <PREFIX>KV_REST_API_URL and <PREFIX>KV_REST_API_TOKEN", async () => {
      clearExactNames()
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL = "https://prefixed.upstash.io"
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN = "prefixed-token"

      await import("@/lib/redis")

      expect(MockRedis).toHaveBeenCalledWith({
        url: "https://prefixed.upstash.io",
        token: "prefixed-token",
      })
    })

    // Sync writes the rules cache, rate-limit entries and sign-out revocations.
    it("never uses the read-only token", async () => {
      clearExactNames()
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL = "https://prefixed.upstash.io"
      process.env.UPSTASH_REDIS_REST_KV_REST_API_READ_ONLY_TOKEN = "read-only-token"
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN = "prefixed-token"

      await import("@/lib/redis")

      expect(MockRedis).toHaveBeenCalledWith(expect.objectContaining({ token: "prefixed-token" }))
    })

    it("prefers the unprefixed names when both are set", async () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io"
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL = "https://prefixed.upstash.io"
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN = "prefixed-token"

      await import("@/lib/redis")

      expect(MockRedis).toHaveBeenCalledWith({
        url: "https://test.upstash.io",
        token: "test-token",
      })
    })
  })

  it("logs which variables it looked for when none are set", async () => {
    for (const name of Object.keys(process.env)) {
      if (/UPSTASH|KV_REST_API/.test(name)) delete process.env[name]
    }
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    await import("@/lib/redis")

    expect(error).toHaveBeenCalledWith(expect.stringMatching(/UPSTASH_REDIS_REST_URL.*KV_REST_API_URL/))
    error.mockRestore()
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