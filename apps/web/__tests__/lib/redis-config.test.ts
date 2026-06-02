// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { mockRedisInstance, MockRedis } = vi.hoisted(() => {
  const mockRedisInstance = { get: vi.fn(), set: vi.fn(), pipeline: vi.fn() }
  const MockRedis = vi.fn(() => mockRedisInstance)
  return { mockRedisInstance, MockRedis }
})

vi.mock("@upstash/redis", () => ({ Redis: MockRedis }))

describe("redis client — Upstash configuration", () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.resetModules()
    MockRedis.mockClear()
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

  it("does not fall back to a raw TCP connection string when Upstash vars are present", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
    delete process.env.REDIS_URL

    await import("@/lib/redis")

    const callArg = MockRedis.mock.calls[0]?.[0]
    expect(typeof callArg).toBe("object")
    expect(callArg).not.toHaveProperty("host")
  })
})