import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    timeLimit: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/redis", () => ({ redis: { del: vi.fn() } }))
vi.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = ""
    },
  },
}))

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { updateTimeLimit } from "@/lib/actions/time-limits"

const mockAuth = auth as unknown as Mock
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  timeLimit: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  user: {
    findUnique: ReturnType<typeof vi.fn>
  }
}

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

function makeTimeLimit(overrides = {}) {
  return {
    id: LIMIT_ID,
    userId: USER_ID,
    domain: "example.com",
    dailyLimit: 30,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    schedules: [],
    ...overrides,
  }
}

function makeSchedule(overrides = {}) {
  return {
    id: "clh3q5g0o0002qmij2z3m4n5k",
    timeLimitId: LIMIT_ID,
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: [1, 2, 3, 4, 5],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(AUTHED_SESSION)
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  )
})

// ---------------------------------------------------------------------------
// A website cannot be both "unconditionally blocked" (dailyLimit: null) and
// "scheduled" (has one or more Schedule rows) at the same time.
// ---------------------------------------------------------------------------

describe("updateTimeLimit — block/schedule mutual exclusivity", () => {
  it("rejects blocking (dailyLimit: null) a website that already has a schedule", async () => {
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({ dailyLimit: 30, schedules: [makeSchedule()] }),
    )

    const result = await updateTimeLimit(LIMIT_ID, { dailyLimit: null })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/schedule/i)
    }
    expect(mockPrisma.timeLimit.update).not.toHaveBeenCalled()
  })

  it("allows blocking a website that has no schedules", async () => {
    const existing = makeTimeLimit({ dailyLimit: 30, schedules: [] })
    mockPrisma.timeLimit.findUnique.mockResolvedValue(existing)
    mockPrisma.timeLimit.update.mockResolvedValue({ ...existing, dailyLimit: null })

    const result = await updateTimeLimit(LIMIT_ID, { dailyLimit: null })
    expect(result.success).toBe(true)
  })

  it("allows unblocking (setting a positive dailyLimit) a website that has schedules", async () => {
    const existing = makeTimeLimit({ dailyLimit: null, schedules: [makeSchedule()] })
    mockPrisma.timeLimit.findUnique.mockResolvedValue(existing)
    mockPrisma.timeLimit.update.mockResolvedValue({ ...existing, dailyLimit: 45 })

    const result = await updateTimeLimit(LIMIT_ID, { dailyLimit: 45 })
    expect(result.success).toBe(true)
  })

  it("allows unrelated updates to a scheduled website when dailyLimit is left untouched", async () => {
    const existing = makeTimeLimit({ dailyLimit: 30, schedules: [makeSchedule()] })
    mockPrisma.timeLimit.findUnique.mockResolvedValue(existing)
    mockPrisma.timeLimit.update.mockResolvedValue({ ...existing, isActive: false })

    const result = await updateTimeLimit(LIMIT_ID, { isActive: false })
    expect(result.success).toBe(true)
  })
})
