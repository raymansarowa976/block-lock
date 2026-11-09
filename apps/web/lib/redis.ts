import { Redis } from "@upstash/redis"

const globalForRedis = globalThis as unknown as { redis?: Redis }

export const redis =
  globalForRedis.redis ??
  // KV_REST_API_* is what Vercel's Upstash marketplace integration provisions.
  new Redis({
    url: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)!,
    token: (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)!,
  })

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis
