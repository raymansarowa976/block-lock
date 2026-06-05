import { redis } from "@/lib/redis"

export const RATE_LIMIT_MAX = 60        // max requests per window
export const RATE_LIMIT_WINDOW_MS = 60_000  // 1-minute sliding window

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number  // Unix timestamp in milliseconds
}

export async function rateLimit(userId: string): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const key = `rl:${userId}`
  // Unique member prevents duplicate scores from colliding in the sorted set
  const member = `${now}:${Math.random().toString(36).slice(2)}`

  const pipe = redis.pipeline()
  // Sliding window: purge entries that have aged out of the window
  pipe.zremrangebyscore(key, 0, windowStart)
  // Record this request
  pipe.zadd(key, { score: now, member })
  // Count all requests currently inside the window (includes this one)
  pipe.zcard(key)
  // Reset the key TTL so idle keys expire automatically
  pipe.pexpire(key, RATE_LIMIT_WINDOW_MS)

  const results = await pipe.exec()
  const count = (results?.[2] as number) ?? 0

  return {
    allowed: count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - count),
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  }
}