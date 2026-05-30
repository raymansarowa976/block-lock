import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    usageLog: { create: vi.fn() },
  },
}))

import { auth } from "@/auth"
import { rateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { POST } from "@/app/api/usage/route"

const mockAuth = auth as unknown as Mock
const mockRateLimit = rateLimit as unknown as Mock
const mockCreate = (prisma as unknown as { usageLog: { create: Mock } }).usageLog.create

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

const RATE_ALLOWED = { allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }
const RATE_BLOCKED = { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }

const VALID_BODY = {
  timeLimitId: LIMIT_ID,
  domain: "example.com",
  duration: 120,
  blockedAt: null,
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// POST /api/usage
// ---------------------------------------------------------------------------

describe("POST /api/usage", () => {
  // ── Authentication ────────────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 when the request is unauthenticated", async () => {
      mockAuth.mockResolvedValue(null)

      const res = await POST(jsonRequest(VALID_BODY))

      expect(res.status).toBe(401)
    })

    it("does not invoke the rate limiter for unauthenticated requests", async () => {
      mockAuth.mockResolvedValue(null)

      await POST(jsonRequest(VALID_BODY))

      expect(mockRateLimit).not.toHaveBeenCalled()
    })

    it("does not open a database connection for unauthenticated requests", async () => {
      mockAuth.mockResolvedValue(null)

      await POST(jsonRequest(VALID_BODY))

      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  // ── Rate limiting ─────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it("returns 429 when the rate limit is exceeded", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_BLOCKED)

      const res = await POST(jsonRequest(VALID_BODY))

      expect(res.status).toBe(429)
    })

    it("does not open a database connection when the rate limit is exceeded", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_BLOCKED)

      await POST(jsonRequest(VALID_BODY))

      expect(mockCreate).not.toHaveBeenCalled()
    })

    it("includes X-RateLimit-Remaining: 0 in the 429 response", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_BLOCKED)

      const res = await POST(jsonRequest(VALID_BODY))

      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0")
    })

    it("includes a positive Retry-After header in the 429 response", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_BLOCKED)

      const res = await POST(jsonRequest(VALID_BODY))

      const retryAfter = Number(res.headers.get("Retry-After"))
      expect(retryAfter).toBeGreaterThan(0)
    })

    it("scopes rate limiting to the authenticated user ID", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_ALLOWED)
      mockCreate.mockResolvedValue({ id: "log-1" })

      await POST(jsonRequest(VALID_BODY))

      expect(mockRateLimit).toHaveBeenCalledWith(USER_ID)
    })
  })

  // ── Input validation ──────────────────────────────────────────────────────

  describe("validation", () => {
    it("returns 400 for an invalid domain", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_ALLOWED)

      const res = await POST(jsonRequest({ ...VALID_BODY, domain: "not a domain!!!" }))

      expect(res.status).toBe(400)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it("returns 400 for a negative duration", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_ALLOWED)

      const res = await POST(jsonRequest({ ...VALID_BODY, duration: -5 }))

      expect(res.status).toBe(400)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it("returns 400 for a malformed JSON body", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_ALLOWED)

      const req = new Request("http://localhost/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ this is not valid json",
      })

      const res = await POST(req)

      expect(res.status).toBe(400)
    })
  })

  // ── Success path ──────────────────────────────────────────────────────────

  describe("success path", () => {
    it("creates a usage log and returns 201", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_ALLOWED)
      mockCreate.mockResolvedValue({ id: "log-1", userId: USER_ID, ...VALID_BODY, loggedAt: new Date() })

      const res = await POST(jsonRequest(VALID_BODY))

      expect(res.status).toBe(201)
      expect(mockCreate).toHaveBeenCalledOnce()
    })

    it("injects the session user ID into the log record", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_ALLOWED)
      mockCreate.mockResolvedValue({ id: "log-1" })

      await POST(jsonRequest(VALID_BODY))

      const data = mockCreate.mock.calls[0][0].data
      expect(data.userId).toBe(USER_ID)
    })

    it("stores all fields from the request body in the log record", async () => {
      mockAuth.mockResolvedValue(AUTHED_SESSION)
      mockRateLimit.mockResolvedValue(RATE_ALLOWED)
      mockCreate.mockResolvedValue({ id: "log-1" })

      await POST(jsonRequest(VALID_BODY))

      const data = mockCreate.mock.calls[0][0].data
      expect(data).toMatchObject({
        timeLimitId: LIMIT_ID,
        domain: "example.com",
        duration: 120,
        blockedAt: null,
      })
    })
  })
})