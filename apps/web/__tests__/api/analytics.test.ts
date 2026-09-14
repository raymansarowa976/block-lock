import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/lib/sync-token", () => ({ verifySyncToken: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    usageLog: { createMany: vi.fn() },
  },
}))

import { verifySyncToken } from "@/lib/sync-token"
import { rateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { POST, OPTIONS } from "@/app/api/analytics/route"

const mockVerify = verifySyncToken as unknown as Mock
const mockRateLimit = rateLimit as unknown as Mock
const mockCreateMany = (
  prisma as unknown as { usageLog: { createMany: Mock } }
).usageLog.createMany

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const VALID_TOKEN = "valid.token"

const RATE_ALLOWED = { allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }
const RATE_BLOCKED = { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }

const EXTENSION_ID = "ldlmnamnojhcjjnfoodglmcnaedagljl"
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

const VALID_ENTRIES = [
  { domain: "example.com", startedAt: 1000, duration: 60000 },
  { domain: "another.com", startedAt: 61000, duration: 30000 },
]

function jsonRequest(body: unknown, options: { token?: string; origin?: string } = {}) {
  const { token, origin } = options
  const headers = new Headers({ "Content-Type": "application/json" })
  if (origin) headers.set("origin", origin)
  const url = token
    ? `http://localhost/api/analytics?token=${token}`
    : "http://localhost/api/analytics"
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateMany.mockResolvedValue({ count: VALID_ENTRIES.length })
  process.env.NEXT_PUBLIC_EXTENSION_ID = EXTENSION_ID
  mockVerify.mockImplementation((token: string) =>
    token === VALID_TOKEN ? { userId: USER_ID } : null,
  )
  mockRateLimit.mockResolvedValue(RATE_ALLOWED)
})

// ---------------------------------------------------------------------------
// POST /api/analytics – authentication (same signed-token scheme as /api/sync
// — a chrome-extension:// service-worker fetch is cross-site and never
// carries the dashboard's session cookie, so auth() always 401s here)
// ---------------------------------------------------------------------------

describe("POST /api/analytics – authentication", () => {
  it("returns 400 when the token query param is absent", async () => {
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }))
    expect(res.status).toBe(400)
  })

  it("does not touch the database when the token is missing", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }))
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("does not invoke the rate limiter when the token is missing", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }))
    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it("returns 401 when the token fails verification", async () => {
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: "garbage" }))
    expect(res.status).toBe(401)
  })

  it("does not touch the database when the token is invalid", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: "garbage" }))
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("does not invoke the rate limiter when the token is invalid", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: "garbage" }))
    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it("never trusts a raw userId passed instead of a token", async () => {
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: USER_ID }))
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – rate limiting (a valid token proves identity but not
// good intent — a leaked or replayed token can still be used to hammer this
// route into repeated createMany writes, so the limiter runs right after
// verification, same as the session-authed routes)
// ---------------------------------------------------------------------------

describe("POST /api/analytics – rate limiting", () => {
  it("returns 429 when the rate limit is exceeded", async () => {
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    expect(res.status).toBe(429)
  })

  it("does not touch the database when the rate limit is exceeded", async () => {
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("includes X-RateLimit-Remaining: 0 in the 429 response", async () => {
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0")
  })

  it("includes a positive Retry-After header in the 429 response", async () => {
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    const retryAfter = Number(res.headers.get("Retry-After"))
    expect(retryAfter).toBeGreaterThan(0)
  })

  it("scopes rate limiting to the token-verified userId", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    expect(mockRateLimit).toHaveBeenCalledWith(USER_ID)
  })

  it("sets CORS headers on a 429 response too, so the extension can read the rejection", async () => {
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)
    const res = await POST(
      jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN, origin: EXTENSION_ORIGIN }),
    )
    expect(res.status).toBe(429)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
  })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – Zod schema validation (acceptance criterion 2)
// ---------------------------------------------------------------------------

describe("POST /api/analytics – Zod schema validation", () => {
  it("returns 400 for an entry with an invalid domain", async () => {
    const res = await POST(
      jsonRequest(
        { entries: [{ domain: "not a domain!!!", startedAt: 1000, duration: 60 }] },
        { token: VALID_TOKEN },
      ),
    )
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for an entry with a negative startedAt", async () => {
    const res = await POST(
      jsonRequest(
        { entries: [{ domain: "example.com", startedAt: -1, duration: 60 }] },
        { token: VALID_TOKEN },
      ),
    )
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for an entry with a negative duration", async () => {
    const res = await POST(
      jsonRequest(
        { entries: [{ domain: "example.com", startedAt: 1000, duration: -1 }] },
        { token: VALID_TOKEN },
      ),
    )
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 when entries is an empty array", async () => {
    const res = await POST(jsonRequest({ entries: [] }, { token: VALID_TOKEN }))
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 when the entries key is missing from the body", async () => {
    const res = await POST(jsonRequest({ domain: "example.com" }, { token: VALID_TOKEN }))
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for a non-integer startedAt", async () => {
    const res = await POST(
      jsonRequest(
        { entries: [{ domain: "example.com", startedAt: 1.5, duration: 60 }] },
        { token: VALID_TOKEN },
      ),
    )
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for malformed JSON body", async () => {
    const req = new Request(`http://localhost/api/analytics?token=${VALID_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("includes validation error details in the 400 response body", async () => {
    const res = await POST(
      jsonRequest(
        { entries: [{ domain: "bad domain!!!", startedAt: 1000, duration: 60 }] },
        { token: VALID_TOKEN },
      ),
    )
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – Prisma createMany batch operation (acceptance criterion 3)
// ---------------------------------------------------------------------------

describe("POST /api/analytics – createMany batch write", () => {
  it("calls usageLog.createMany exactly once for a valid batch", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    expect(mockCreateMany).toHaveBeenCalledOnce()
  })

  it("passes all entries as a single data array to createMany", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    const { data } = mockCreateMany.mock.calls[0][0]
    expect(data).toHaveLength(VALID_ENTRIES.length)
  })

  it("injects the token-verified userId into every row", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    const { data } = mockCreateMany.mock.calls[0][0]
    expect(data.every((row: { userId: string }) => row.userId === USER_ID)).toBe(true)
  })

  it("maps the domain field from each entry to the corresponding row", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    const { data } = mockCreateMany.mock.calls[0][0]
    const domains = data.map((r: { domain: string }) => r.domain)
    expect(domains).toEqual(["example.com", "another.com"])
  })

  it("maps the duration field from each entry to the corresponding row", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    const { data } = mockCreateMany.mock.calls[0][0]
    expect(data[0].duration).toBe(VALID_ENTRIES[0].duration)
    expect(data[1].duration).toBe(VALID_ENTRIES[1].duration)
  })

  it("does not call createMany more than once regardless of batch size", async () => {
    const bigBatch = Array.from({ length: 20 }, (_, i) => ({
      domain: `site${i}.com`,
      startedAt: i * 1000,
      duration: 5000,
    }))
    await POST(jsonRequest({ entries: bigBatch }, { token: VALID_TOKEN }))
    expect(mockCreateMany).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – success response
// ---------------------------------------------------------------------------

describe("POST /api/analytics – success response", () => {
  it("returns 201 on a valid batch", async () => {
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    expect(res.status).toBe(201)
  })

  it("returns the count of inserted records in the response body", async () => {
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN }))
    const body = await res.json()
    expect(body.count).toBe(VALID_ENTRIES.length)
  })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – CORS (chrome-extension origin)
// ---------------------------------------------------------------------------

describe("POST /api/analytics – CORS – extension origin handling", () => {
  it("echoes the extension origin in Access-Control-Allow-Origin", async () => {
    const res = await POST(
      jsonRequest({ entries: VALID_ENTRIES }, { token: VALID_TOKEN, origin: EXTENSION_ORIGIN }),
    )
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
  })

  it("does not set Access-Control-Allow-Origin for an unrelated origin", async () => {
    const res = await POST(
      jsonRequest(
        { entries: VALID_ENTRIES },
        { token: VALID_TOKEN, origin: "https://evil.com" },
      ),
    )
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })

  it("sets CORS headers on a 401 response too, so the extension can read the rejection", async () => {
    const res = await POST(
      jsonRequest({ entries: VALID_ENTRIES }, { token: "garbage", origin: EXTENSION_ORIGIN }),
    )
    expect(res.status).toBe(401)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
  })

  it("responds to an OPTIONS preflight from the extension origin with 204 and CORS headers", async () => {
    const headers = new Headers()
    headers.set("origin", EXTENSION_ORIGIN)
    const res = await OPTIONS(new Request("http://localhost/api/analytics", { method: "OPTIONS", headers }))
    expect(res.status).toBe(204)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
  })
})
