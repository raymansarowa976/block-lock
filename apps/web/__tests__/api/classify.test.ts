import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }))
vi.mock("@/lib/classification/classify-domain", () => ({ classifyDomain: vi.fn() }))

import { auth } from "@/auth"
import { rateLimit } from "@/lib/rate-limit"
import { classifyDomain } from "@/lib/classification/classify-domain"
import { POST } from "@/app/api/classify/route"

const mockAuth = auth as unknown as Mock
const mockRateLimit = rateLimit as unknown as Mock
const mockClassify = classifyDomain as unknown as Mock

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

const RATE_ALLOWED = { allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }
const RATE_BLOCKED = { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }

const DOMAIN = "doomscroll.example.com"

const MATCHED_RESULT = {
  domain: DOMAIN,
  matched: true,
  label: "social media",
  similarity: 0.91,
  blocked: true,
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// POST /api/classify – authentication
// ---------------------------------------------------------------------------

describe("POST /api/classify – authentication", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(jsonRequest({ domain: DOMAIN }))

    expect(res.status).toBe(401)
  })

  it("does not classify the domain for unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null)

    await POST(jsonRequest({ domain: DOMAIN }))

    expect(mockClassify).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/classify – rate limiting
// ---------------------------------------------------------------------------

describe("POST /api/classify – rate limiting", () => {
  it("returns 429 when the rate limit is exceeded", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)

    const res = await POST(jsonRequest({ domain: DOMAIN }))

    expect(res.status).toBe(429)
  })

  it("does not classify the domain when the rate limit is exceeded", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)

    await POST(jsonRequest({ domain: DOMAIN }))

    expect(mockClassify).not.toHaveBeenCalled()
  })

  it("scopes rate limiting to the authenticated user ID", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockClassify.mockResolvedValue(MATCHED_RESULT)

    await POST(jsonRequest({ domain: DOMAIN }))

    expect(mockRateLimit).toHaveBeenCalledWith(USER_ID)
  })
})

// ---------------------------------------------------------------------------
// POST /api/classify – request validation
// ---------------------------------------------------------------------------

describe("POST /api/classify – request validation", () => {
  it("returns 400 for a missing domain", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)

    const res = await POST(jsonRequest({}))

    expect(res.status).toBe(400)
    expect(mockClassify).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid domain", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)

    const res = await POST(jsonRequest({ domain: "not a domain!!!" }))

    expect(res.status).toBe(400)
    expect(mockClassify).not.toHaveBeenCalled()
  })

  it("returns 400 for a malformed JSON body", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)

    const req = new Request("http://localhost/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not valid json",
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(mockClassify).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/classify – success path
// ---------------------------------------------------------------------------

describe("POST /api/classify – success path", () => {
  it("classifies the domain on behalf of the authenticated user and returns 200", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockClassify.mockResolvedValue(MATCHED_RESULT)

    const res = await POST(jsonRequest({ domain: DOMAIN }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockClassify).toHaveBeenCalledWith(USER_ID, DOMAIN)
    expect(body).toEqual(MATCHED_RESULT)
  })

  it("returns 502 when the classification pipeline fails", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockClassify.mockRejectedValue(new Error("embedding model unreachable"))

    const res = await POST(jsonRequest({ domain: DOMAIN }))

    expect(res.status).toBe(502)
  })
})