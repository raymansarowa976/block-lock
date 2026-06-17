/**
 * AI Engine Validation & Error Mitigation Matrix
 *
 * Three categories of failure this suite guards against:
 *
 * 1. LLM hallucination / structural drift — model returns a structurally
 *    invalid object (null, empty blocks, wrong types). Validation must block
 *    the corrupted payload BEFORE any Prisma write is attempted.
 *
 * 2. Nonsensical or adversarial input strings — empty prompts, whitespace,
 *    over-long inputs, null values. The system must return a standardized
 *    `{ success: false, error: "..." }` payload instead of forwarding the
 *    broken input to the model.
 *
 * 3. Empty / whitespace model output — when the productivity coach returns
 *    blank text the resulting insight must NOT be persisted to the database.
 *
 * Tests that assert `body.success === false` will FAIL against the current
 * implementation (routes return `{ error: "..." }` without a `success` field).
 * Tests that assert `productivityInsight.create` is NOT called for empty output
 * will also FAIL (the cron route currently persists whatever text it receives).
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest"

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
    usageLog: { findMany: vi.fn() },
    productivityInsight: { create: vi.fn() },
  },
}))
vi.mock("@/lib/insights/aggregate-usage", () => ({
  aggregateWeeklyUsage: vi.fn(),
  TRAILING_WINDOW_DAYS: 7,
}))
vi.mock("@/lib/ai/productivity-coach", () => ({ generateProductivityInsight: vi.fn() }))

import { auth } from "@/auth"
import { rateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { parseScheduleFromPrompt } from "@/lib/ai/schedule-parser"
import { aggregateWeeklyUsage } from "@/lib/insights/aggregate-usage"
import { generateProductivityInsight } from "@/lib/ai/productivity-coach"
import { POST as schedulePost } from "@/app/api/ai/schedule/route"
import { GET as cronGet } from "@/app/api/cron/insights/route"

const mockAuth = auth as unknown as Mock
const mockRateLimit = rateLimit as unknown as Mock
const mockParse = parseScheduleFromPrompt as unknown as Mock
const mockAggregate = aggregateWeeklyUsage as unknown as Mock
const mockGenerate = generateProductivityInsight as unknown as Mock
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  timeLimit: { upsert: ReturnType<typeof vi.fn> }
  schedule: { create: ReturnType<typeof vi.fn> }
  usageLog: { findMany: ReturnType<typeof vi.fn> }
  productivityInsight: { create: ReturnType<typeof vi.fn> }
}

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const USER_B = "clh3q5g0o0001qmij2z3m4n5l"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }
const RATE_ALLOWED = { allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }
const CRON_SECRET = "test-cron-secret"

function scheduleRequest(body: unknown) {
  return new Request("http://localhost/api/ai/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function cronRequest() {
  return new Request("http://localhost/api/cron/insights", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

function summaryFor(userId: string, domainCount: number) {
  return {
    userId,
    periodStart: "2026-05-31T00:00:00.000Z",
    periodEnd: "2026-06-07T00:00:00.000Z",
    domains: Array.from({ length: domainCount }, (_, i) => ({
      domain: `domain-${i}.com`,
      totalMinutes: 60,
      sessionCount: 5,
      blockedCount: 1,
      microRelapses: 1,
    })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("CRON_SECRET", CRON_SECRET)
  mockAuth.mockResolvedValue(AUTHED_SESSION)
  mockRateLimit.mockResolvedValue(RATE_ALLOWED)
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  )
  mockPrisma.usageLog.findMany.mockResolvedValue([])
  mockAggregate.mockResolvedValue(summaryFor(USER_ID, 1))
  mockGenerate.mockResolvedValue("## Weekly briefing\n\nGood progress!")
  mockPrisma.productivityInsight.create.mockResolvedValue({ id: "insight-1" })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Category 1 – LLM hallucination / structural drift
//
// These verify that malformed model output is ALWAYS blocked before Prisma.
// Each test checks:
//   a) the correct HTTP status (502)
//   b) the response uses the standardized { success: false, error: "..." } shape  ← FAILS today
//   c) no Prisma transaction was started
// ---------------------------------------------------------------------------

describe("AI Engine Validation Matrix – hallucination rejection (schedule route)", () => {
  it("rejects null returned by the model and does not touch Prisma", async () => {
    mockParse.mockResolvedValue(null)

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS: current code omits the success field
    expect(typeof body.error).toBe("string")
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("rejects an empty blocks array — model must always emit at least one rule", async () => {
    mockParse.mockResolvedValue({ blocks: [] })

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("rejects a blocks field that is a string instead of an array (structural drift)", async () => {
    mockParse.mockResolvedValue({ blocks: "facebook.com 09:00-17:00" })

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("rejects a top-level array instead of an object (corrupted payload format)", async () => {
    mockParse.mockResolvedValue([
      { domain: "facebook.com", startTime: "09:00", endTime: "17:00", daysOfWeek: [1] },
    ])

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("rejects a hallucinated domain format inside a block", async () => {
    mockParse.mockResolvedValue({
      blocks: [{ domain: "not a real domain!!!", startTime: "09:00", endTime: "17:00", daysOfWeek: [1] }],
    })

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("rejects an informal time format (model writes '9am' instead of '09:00')", async () => {
    mockParse.mockResolvedValue({
      blocks: [{ domain: "facebook.com", startTime: "9am", endTime: "5pm", daysOfWeek: [1] }],
    })

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("rejects a day-of-week value outside the 0-6 range (model hallucinates day 7)", async () => {
    mockParse.mockResolvedValue({
      blocks: [{ domain: "facebook.com", startTime: "09:00", endTime: "17:00", daysOfWeek: [7] }],
    })

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("rejects a block that is missing required fields (startTime, endTime, daysOfWeek)", async () => {
    mockParse.mockResolvedValue({
      blocks: [{ domain: "facebook.com" }],
    })

    const res = await schedulePost(scheduleRequest({ prompt: "block social media" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("rejects a blocks array whose items are primitive strings instead of objects", async () => {
    mockParse.mockResolvedValue({ blocks: ["facebook.com", "instagram.com"] })

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Category 2 – Nonsensical / adversarial input strings
//
// The route must reject invalid inputs at the Zod layer and return the
// standardized `{ success: false, error: "..." }` payload.
// Status-code assertions will PASS (existing behaviour); success:false will FAIL.
// ---------------------------------------------------------------------------

describe("AI Engine Validation Matrix – nonsensical input handling (schedule route)", () => {
  it("returns 400 with { success: false } for an empty string prompt", async () => {
    const res = await schedulePost(scheduleRequest({ prompt: "" }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)        // FAILS
    expect(body.error).toBeDefined()
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 400 with { success: false } for a whitespace-only prompt", async () => {
    const res = await schedulePost(scheduleRequest({ prompt: "          " }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)        // FAILS
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 400 with { success: false } for a prompt that exceeds 500 characters", async () => {
    const res = await schedulePost(scheduleRequest({ prompt: "x".repeat(501) }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)        // FAILS
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 400 with { success: false } when the prompt field is null", async () => {
    const res = await schedulePost(scheduleRequest({ prompt: null }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)        // FAILS
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 400 with { success: false } when the prompt field is a number", async () => {
    const res = await schedulePost(scheduleRequest({ prompt: 42 }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)        // FAILS
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 400 with { success: false } when no body fields are provided", async () => {
    const res = await schedulePost(scheduleRequest({}))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)        // FAILS
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 400 with { success: false } for a syntactically malformed JSON body", async () => {
    const req = new Request("http://localhost/api/ai/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is : not : valid : json",
    })

    const res = await schedulePost(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)        // FAILS
    expect(mockParse).not.toHaveBeenCalled()
  })

  it("returns 502 with { success: false } when the model provider call fails", async () => {
    mockParse.mockRejectedValue(new Error("upstream timeout"))

    const res = await schedulePost(scheduleRequest({ prompt: "block social media 9 to 5" }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)        // FAILS
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Category 3 – Empty / whitespace productivity coach output
//
// When `generateProductivityInsight` returns blank text the cron route must
// skip the DB write for that user.  These tests FAIL today because the cron
// route calls `productivityInsight.create` unconditionally.
// ---------------------------------------------------------------------------

describe("AI Engine Validation Matrix – empty productivity coach output", () => {
  it("does not persist an insight when the coach returns an empty string", async () => {
    mockPrisma.usageLog.findMany.mockResolvedValue([{ userId: USER_ID }])
    mockAggregate.mockResolvedValue(summaryFor(USER_ID, 2))
    mockGenerate.mockResolvedValue("")

    await cronGet(cronRequest())

    // FAILS: the current route calls create regardless of whether markdown is empty
    expect(mockPrisma.productivityInsight.create).not.toHaveBeenCalled()
  })

  it("does not persist an insight when the coach returns only whitespace", async () => {
    mockPrisma.usageLog.findMany.mockResolvedValue([{ userId: USER_ID }])
    mockAggregate.mockResolvedValue(summaryFor(USER_ID, 2))
    mockGenerate.mockResolvedValue("   \n\n\t   ")

    await cronGet(cronRequest())

    // FAILS: current route persists "   \n\n\t   " as the summary
    expect(mockPrisma.productivityInsight.create).not.toHaveBeenCalled()
  })

  it("continues to the next user when the current user's insight is empty", async () => {
    mockPrisma.usageLog.findMany.mockResolvedValue([
      { userId: USER_ID },
      { userId: USER_B },
    ])
    mockAggregate
      .mockResolvedValueOnce(summaryFor(USER_ID, 2))
      .mockResolvedValueOnce(summaryFor(USER_B, 1))
    mockGenerate
      .mockResolvedValueOnce("")           // USER_ID: empty — must be skipped
      .mockResolvedValueOnce("## Good week!") // USER_B: valid — must be persisted

    const res = await cronGet(cronRequest())
    const body = await res.json()

    // FAILS: current route calls create twice, not once
    expect(mockPrisma.productivityInsight.create).toHaveBeenCalledTimes(1)
    // FAILS: current route counts both users as processed
    expect(body.processed).toBe(1)
  })

  it("reports zero processed insights when every user's coach output is empty", async () => {
    mockPrisma.usageLog.findMany.mockResolvedValue([{ userId: USER_ID }])
    mockAggregate.mockResolvedValue(summaryFor(USER_ID, 2))
    mockGenerate.mockResolvedValue("")

    const res = await cronGet(cronRequest())
    const body = await res.json()

    // FAILS: current route increments processed for the empty insight
    expect(body.processed).toBe(0)
  })

  it("persists a valid non-empty insight without modification", async () => {
    mockPrisma.usageLog.findMany.mockResolvedValue([{ userId: USER_ID }])
    mockAggregate.mockResolvedValue(summaryFor(USER_ID, 2))
    mockGenerate.mockResolvedValue("## Great focus week!\n\n- Reduced social media by 30%")

    await cronGet(cronRequest())

    expect(mockPrisma.productivityInsight.create).toHaveBeenCalledTimes(1)
    const createArgs = mockPrisma.productivityInsight.create.mock.calls[0][0]
    expect(createArgs.data.summary).toBe("## Great focus week!\n\n- Reduced social media by 30%")
  })
})
