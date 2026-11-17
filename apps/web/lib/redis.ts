import { Redis } from "@upstash/redis"

const globalForRedis = globalThis as unknown as { redis?: Redis }

// Upstash's own names, then the KV_REST_API_* names Vercel's Upstash
// marketplace integration provisions. Connecting that integration with a
// custom prefix (e.g. "UPSTASH_REDIS_REST_") yields <PREFIX>KV_REST_API_URL /
// <PREFIX>KV_REST_API_TOKEN, so any name ending that way is accepted too.
// The suffix match can't pick up <PREFIX>KV_REST_API_READ_ONLY_TOKEN, which
// sync can't use: it writes the rules cache, rate limits and revocations.
function readEnv(exact: string[], suffix: string): string | undefined {
  for (const name of exact) {
    if (process.env[name]) return process.env[name]
  }
  const prefixed = Object.keys(process.env)
    .filter((name) => name.endsWith(`_${suffix}`))
    .sort()
  return prefixed.map((name) => process.env[name]).find(Boolean)
}

function createRedis(): Redis {
  const url = readEnv(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"], "KV_REST_API_URL")
  const token = readEnv(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"], "KV_REST_API_TOKEN")

  // Without these every Redis call fails, which surfaces as a 500 from
  // /api/sync and "server error" in the extension popup.
  if (!url || !token) {
    console.error(
      "Redis is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN " +
        "(or KV_REST_API_URL and KV_REST_API_TOKEN, optionally with a prefix).",
    )
  }

  return new Redis({ url: url!, token: token! })
}

export const redis = globalForRedis.redis ?? createRedis()

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis
