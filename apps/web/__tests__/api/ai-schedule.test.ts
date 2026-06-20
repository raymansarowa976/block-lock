import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }))
vi.mock("@/lib/redis", () => ({ redis: { del: vi.fn() } }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/ai/schedule-parser", () => ({ parseScheduleFromPrompt: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    timeLimit: { upsert: vi.fn() },
    schedule: { create: vi.fn() },
  },
}))

import { auth } from "@/auth"
import { rateLimit } from "@/lib/rate-limit"
import { redis } from "@/lib/redis"
import { prisma } from "@/lib/prisma"
import { parseScheduleFromPrompt } from "@/lib/ai/schedule-parser"
import { POST } from "@/app/api/ai/schedule/route"

const mockAuth = auth as unknown as Mock
const mockRateLimit = rateLimit as unknown as Mock
const mockParse = parseScheduleFromPrompt as unknown as Mock
const mockRedisDel = (redis as unknown as { del: Mock }).del
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  timeLimit: { upsert: ReturnType<typeof vi.fn> }
  schedule: { create: ReturnType<typeof vi.fn> }
}

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const SCHEDULE_ID = "clh3q5g0o0003qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

const RATE_ALLOWED = { allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }
const RATE_BLOCKED = { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }

const PROMPT = "Block social media while I work on my CS classes from 9 to 5"

const VALID_BLOCK = {
  domain: "facebook.com",
  startTime: "09:00",
  endTime: "17:00",
  daysOfWeek: [1, 2, 3, 4, 5],
}

function makeTimeLimit(domain = VALID_BLOCK.domain) {
  return { id: LIMIT_ID, userId: USER_ID, domain, dailyLimit: null, isActive: true }
}

function makeSchedule() {
  return {
    id: SCHEDULE_ID,
    timeLimitId: LIMIT_ID,
    startTime: VALID_BLOCK.startTime,
    endTime: VALID_BLOCK.endTime,
    daysOfWeek: VALID_BLOCK.daysOfWeek,
  }
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/ai/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  )
})

// ---------------------------------------------------------------------------
// POST /api/ai/schedule – authentication
// ---------------------------------------------------------------------------

describe("POST /api/ai/schedule – authentication", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(jsonRequest({ prompt: PROMPT }))

    expect(res.status).toBe(401)
  })

  it("does not invoke the rate limiter for unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null)

    await POST(jsonRequest({ prompt: PROMPT }))

    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it("does not call the model for unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null)

    await POST(jsonRequest({ prompt: PROMPT }))

    expect(mockParse).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/ai/schedule – rate limiting
// ---------------------------------------------------------------------------

describe("POST /api/ai/schedule – rate limiting", () => {
  it("returns 429 when the rate limit is exceeded", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)

    const res = await POST(jsonRequest({ prompt: PROMPT }))

    expect(res.status).toBe(429)
  })

  it("does not call the model when the rate limit is exceeded", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_BLOCKED)

    await POST(jsonRequest({ prompt: PROMPT }))

    expect(mockParse).not.toHaveBeenCalled()
  })

  it("scopes rate limiting to the authenticated user ID", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockParse.mockResolvedValue({ blocks: [VALID_BLOCK] })
    mockPrisma.timeLimit.upsert.mockResolvedValue(makeTimeLimit())
    mockPrisma.schedule.create.mockResolvedValue(makeSchedule())

    await POST(jsonRequest({ prompt: PROMPT }))

    expect(mockRateLimit).toHaveBeenCalledWith(USER_ID)
  })
})

// ---------------------------------------------------------------------------
// POST /api/ai/schedule – request validation
// ---------------------------------------------------------------------------

describe("POST /api/ai/schedule – request validation", () => {
  it("returns 400 for a missing prompt", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)

    const res = await POST(jsonRequest({}))

    expect(res.status).toBe(400)
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 400 for an empty prompt", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)

    const res = await POST(jsonRequest({ prompt: "   " }))

    expect(res.status).toBe(400)
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 400 for a malformed JSON body", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)

    const req = new Request("http://localhost/api/ai/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not valid json",
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(mockParse).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/ai/schedule – structured-output / model integration
// ---------------------------------------------------------------------------

describe("POST /api/ai/schedule – model integration", () => {
  it("invokes the parser with the user's natural-language prompt", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockParse.mockResolvedValue({ blocks: [VALID_BLOCK] })
    mockPrisma.timeLimit.upsert.mockResolvedValue(makeTimeLimit())
    mockPrisma.schedule.create.mockResolvedValue(makeSchedule())

    await POST(jsonRequest({ prompt: PROMPT }))

    expect(mockParse).toHaveBeenCalledWith(PROMPT)
  })

  it("returns 502 when the model call fails", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockParse.mockRejectedValue(new Error("upstream timeout"))

    const res = await POST(jsonRequest({ prompt: PROMPT }))

    expect(res.status).toBe(502)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("returns 502 when the model returns a structure that fails schema validation", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockParse.mockResolvedValue({ blocks: [{ domain: "not a domain!!!", startTime: "9am", endTime: "17:00", daysOfWeek: [9] }] })

    const res = await POST(jsonRequest({ prompt: PROMPT }))

    expect(res.status).toBe(502)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/ai/schedule – success path
// ---------------------------------------------------------------------------

describe("POST /api/ai/schedule – success path", () => {
  it("creates a TimeLimit and Schedule for each parsed block and returns 201", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockParse.mockResolvedValue({ blocks: [VALID_BLOCK] })
    mockPrisma.timeLimit.upsert.mockResolvedValue(makeTimeLimit())
    mockPrisma.schedule.create.mockResolvedValue(makeSchedule())

    const res = await POST(jsonRequest({ prompt: PROMPT }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
  })

  it("scopes the created TimeLimit to the authenticated user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockParse.mockResolvedValue({ blocks: [VALID_BLOCK] })
    mockPrisma.timeLimit.upsert.mockResolvedValue(makeTimeLimit())
    mockPrisma.schedule.create.mockResolvedValue(makeSchedule())

    await POST(jsonRequest({ prompt: PROMPT }))

    const args = mockPrisma.timeLimit.upsert.mock.calls[0][0]
    expect(args.create.userId).toBe(USER_ID)
    expect(args.create.domain).toBe(VALID_BLOCK.domain)
  })

  it("creates the schedule with the parsed time window and days, attached to the resolved TimeLimit", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockParse.mockResolvedValue({ blocks: [VALID_BLOCK] })
    mockPrisma.timeLimit.upsert.mockResolvedValue(makeTimeLimit())
    mockPrisma.schedule.create.mockResolvedValue(makeSchedule())

    await POST(jsonRequest({ prompt: PROMPT }))

    const args = mockPrisma.schedule.create.mock.calls[0][0]
    expect(args.data).toMatchObject({
      timeLimitId: LIMIT_ID,
      startTime: VALID_BLOCK.startTime,
      endTime: VALID_BLOCK.endTime,
      daysOfWeek: VALID_BLOCK.daysOfWeek,
    })
  })

  it("creates one TimeLimit/Schedule pair per parsed block", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    const secondBlock = { ...VALID_BLOCK, domain: "instagram.com" }
    mockParse.mockResolvedValue({ blocks: [VALID_BLOCK, secondBlock] })
    mockPrisma.timeLimit.upsert
      .mockResolvedValueOnce(makeTimeLimit("facebook.com"))
      .mockResolvedValueOnce(makeTimeLimit("instagram.com"))
    mockPrisma.schedule.create.mockResolvedValue(makeSchedule())

    const res = await POST(jsonRequest({ prompt: PROMPT }))
    const body = await res.json()

    expect(mockPrisma.timeLimit.upsert).toHaveBeenCalledTimes(2)
    expect(mockPrisma.schedule.create).toHaveBeenCalledTimes(2)
    expect(body.data).toHaveLength(2)
  })

  it("invalidates the user's cached rules after creating records", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockRateLimit.mockResolvedValue(RATE_ALLOWED)
    mockParse.mockResolvedValue({ blocks: [VALID_BLOCK] })
    mockPrisma.timeLimit.upsert.mockResolvedValue(makeTimeLimit())
    mockPrisma.schedule.create.mockResolvedValue(makeSchedule())

    await POST(jsonRequest({ prompt: PROMPT }))

    expect(mockRedisDel).toHaveBeenCalledWith(`user:rules:${USER_ID}`)
  })
})