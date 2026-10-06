import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest"

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
import { deleteTimeLimit, updateTimeLimit } from "@/lib/actions/time-limits"

const mockAuth = auth as unknown as Mock
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  timeLimit: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  user: {
    findUnique: ReturnType<typeof vi.fn>
  }
}

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

function makeUser(overrides = {}) {
  return {
    id: USER_ID,
    email: "test@example.com",
    hardLockMode: false,
    ...overrides,
  }
}

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
    startTime: "14:00",
    endTime: "15:00",
    daysOfWeek: [3],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  // Wednesday 2024-03-13 at 14:30 — within 14:00–15:00 on day 3 (Wednesday)
  vi.setSystemTime(new Date("2024-03-13T14:30:00"))

  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// deleteTimeLimit — hard lock enforcement
// ---------------------------------------------------------------------------

describe("deleteTimeLimit with Hard Lock Mode", () => {
  it("rejects deletion when hard lock is enabled and a schedule is currently active", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: true }))
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({
        isActive: true,
        schedules: [makeSchedule({ startTime: "14:00", endTime: "15:00", daysOfWeek: [3] })],
      }),
    )

    const result = await deleteTimeLimit(LIMIT_ID)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/hard lock/i)
    }
    expect(mockPrisma.timeLimit.delete).not.toHaveBeenCalled()
  })

  it("allows deletion when hard lock is enabled but no schedule is currently active", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: true }))
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({
        isActive: true,
        schedules: [makeSchedule({ startTime: "20:00", endTime: "22:00", daysOfWeek: [3] })],
      }),
    )
    mockPrisma.timeLimit.delete.mockResolvedValue(undefined)

    const result = await deleteTimeLimit(LIMIT_ID)
    expect(result).toEqual({ success: true })
  })

  it("allows deletion when hard lock is enabled but the time limit is inactive", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: true }))
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({
        isActive: false,
        schedules: [makeSchedule({ startTime: "14:00", endTime: "15:00", daysOfWeek: [3] })],
      }),
    )
    mockPrisma.timeLimit.delete.mockResolvedValue(undefined)

    const result = await deleteTimeLimit(LIMIT_ID)
    expect(result).toEqual({ success: true })
  })

  it("allows deletion when hard lock is disabled even if a schedule is active", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: false }))
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({
        isActive: true,
        schedules: [makeSchedule({ startTime: "14:00", endTime: "15:00", daysOfWeek: [3] })],
      }),
    )
    mockPrisma.timeLimit.delete.mockResolvedValue(undefined)

    const result = await deleteTimeLimit(LIMIT_ID)
    expect(result).toEqual({ success: true })
  })

  it("rejects deletion when current day matches schedule daysOfWeek", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: true }))
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({
        isActive: true,
        schedules: [
          makeSchedule({ startTime: "14:00", endTime: "15:00", daysOfWeek: [1, 2, 3, 4, 5] }),
        ],
      }),
    )

    const result = await deleteTimeLimit(LIMIT_ID)
    expect(result.success).toBe(false)
  })

  it("allows deletion when current day does not match schedule daysOfWeek", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: true }))
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({
        isActive: true,
        schedules: [
          makeSchedule({ startTime: "14:00", endTime: "15:00", daysOfWeek: [0, 6] }),
        ],
      }),
    )
    mockPrisma.timeLimit.delete.mockResolvedValue(undefined)

    const result = await deleteTimeLimit(LIMIT_ID)
    expect(result).toEqual({ success: true })
  })
})

// ---------------------------------------------------------------------------
// updateTimeLimit — hard lock enforcement
// ---------------------------------------------------------------------------

describe("updateTimeLimit with Hard Lock Mode", () => {
  it("rejects update when hard lock is enabled and a schedule is currently active", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: true }))
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({
        isActive: true,
        schedules: [makeSchedule({ startTime: "14:00", endTime: "15:00", daysOfWeek: [3] })],
      }),
    )

    const result = await updateTimeLimit(LIMIT_ID, { isActive: false })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/hard lock/i)
    }
    expect(mockPrisma.timeLimit.update).not.toHaveBeenCalled()
  })

  it("allows update when hard lock is enabled but no schedule is currently active", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: true }))
    const existing = makeTimeLimit({
      isActive: true,
      schedules: [makeSchedule({ startTime: "20:00", endTime: "22:00", daysOfWeek: [3] })],
    })
    mockPrisma.timeLimit.findUnique.mockResolvedValue(existing)
    mockPrisma.timeLimit.update.mockResolvedValue({ ...existing, isActive: false })

    const result = await updateTimeLimit(LIMIT_ID, { isActive: false })
    expect(result.success).toBe(true)
  })

  it("allows update when hard lock is disabled even if a schedule is active", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ hardLockMode: false }))
    const existing = makeTimeLimit({
      isActive: true,
      schedules: [makeSchedule({ startTime: "14:00", endTime: "15:00", daysOfWeek: [3] })],
    })
    mockPrisma.timeLimit.findUnique.mockResolvedValue(existing)
    mockPrisma.timeLimit.update.mockResolvedValue({ ...existing, isActive: false })

    const result = await updateTimeLimit(LIMIT_ID, { isActive: false })
    expect(result.success).toBe(true)
  })
})