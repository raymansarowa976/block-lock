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
    schedule: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/redis", () => ({ redis: { del: vi.fn() } }))
vi.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error { code = "" },
  },
}))

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { createTimeLimit, updateTimeLimit, deleteTimeLimit } from "@/lib/actions/time-limits"
import { createSchedule, updateSchedule, deleteSchedule } from "@/lib/actions/schedules"

const mockAuth = auth as unknown as Mock
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  timeLimit: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  schedule: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}
const mockDel = (redis as unknown as { del: ReturnType<typeof vi.fn> }).del

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const OTHER_USER_ID = "clh3q5g0o0002qmij2z3m4n5k"
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const SCHEDULE_ID = "clh3q5g0o0003qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }
// The cache key pattern the actions must evict
const CACHE_KEY = `user:rules:${USER_ID}`

const VALID_SCHEDULE_INPUT = {
  timeLimitId: LIMIT_ID,
  startTime: "09:00",
  endTime: "17:00",
  daysOfWeek: [1, 2, 3, 4, 5],
}

function makeTimeLimit(userId = USER_ID) {
  return { id: LIMIT_ID, userId, domain: "example.com", dailyLimit: 30, isActive: true }
}

// makeSchedule includes the nested timeLimit relation so updateSchedule /
// deleteSchedule ownership checks pass without extra setup.
function makeSchedule(timeLimitUserId = USER_ID) {
  return {
    id: SCHEDULE_ID,
    timeLimitId: LIMIT_ID,
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: [1, 2, 3, 4, 5],
    createdAt: new Date(),
    updatedAt: new Date(),
    timeLimit: makeTimeLimit(timeLimitUserId),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  )
})

// ---------------------------------------------------------------------------
// createTimeLimit
// ---------------------------------------------------------------------------

describe("createTimeLimit — cache invalidation", () => {
  it("evicts user:rules:{userId} after a successful creation", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.create.mockResolvedValue(makeTimeLimit())

    await createTimeLimit({ domain: "example.com", dailyLimit: 30 })

    expect(mockDel).toHaveBeenCalledOnce()
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY)
  })

  it("does not evict the cache when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    await createTimeLimit({ domain: "example.com", dailyLimit: 30 })

    expect(mockDel).not.toHaveBeenCalled()
  })

  it("does not evict the cache on input validation failure", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)

    await createTimeLimit({ domain: "not a valid domain!!!" })

    expect(mockDel).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// updateTimeLimit
// ---------------------------------------------------------------------------

describe("updateTimeLimit — cache invalidation", () => {
  it("evicts user:rules:{userId} after a successful update", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit())
    mockPrisma.timeLimit.update.mockResolvedValue(makeTimeLimit())

    await updateTimeLimit(LIMIT_ID, { isActive: false })

    expect(mockDel).toHaveBeenCalledOnce()
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY)
  })

  it("does not evict the cache when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    await updateTimeLimit(LIMIT_ID, { isActive: false })

    expect(mockDel).not.toHaveBeenCalled()
  })

  it("does not evict the cache when the Prisma transaction throws", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit(OTHER_USER_ID))

    await expect(updateTimeLimit(LIMIT_ID, { isActive: false })).rejects.toThrow()

    expect(mockDel).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// deleteTimeLimit
// ---------------------------------------------------------------------------

describe("deleteTimeLimit — cache invalidation", () => {
  it("evicts user:rules:{userId} after a successful deletion", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit())
    mockPrisma.timeLimit.delete.mockResolvedValue(undefined)

    await deleteTimeLimit(LIMIT_ID)

    expect(mockDel).toHaveBeenCalledOnce()
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY)
  })

  it("does not evict the cache when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    await deleteTimeLimit(LIMIT_ID)

    expect(mockDel).not.toHaveBeenCalled()
  })

  it("does not evict the cache when the Prisma transaction throws", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit(OTHER_USER_ID))

    await expect(deleteTimeLimit(LIMIT_ID)).rejects.toThrow()

    expect(mockDel).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// createSchedule
// ---------------------------------------------------------------------------

describe("createSchedule — cache invalidation", () => {
  it("evicts user:rules:{userId} after a successful creation", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit())
    mockPrisma.schedule.create.mockResolvedValue(makeSchedule())

    await createSchedule(VALID_SCHEDULE_INPUT)

    expect(mockDel).toHaveBeenCalledOnce()
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY)
  })

  it("does not evict the cache when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    await createSchedule(VALID_SCHEDULE_INPUT)

    expect(mockDel).not.toHaveBeenCalled()
  })

  it("does not evict the cache when the Prisma transaction throws", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit(OTHER_USER_ID))

    await expect(createSchedule(VALID_SCHEDULE_INPUT)).rejects.toThrow()

    expect(mockDel).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// updateSchedule
// ---------------------------------------------------------------------------

describe("updateSchedule — cache invalidation", () => {
  it("evicts user:rules:{userId} after a successful update", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.schedule.findUnique.mockResolvedValue(makeSchedule())
    mockPrisma.schedule.update.mockResolvedValue(makeSchedule())

    await updateSchedule(SCHEDULE_ID, { startTime: "10:00" })

    expect(mockDel).toHaveBeenCalledOnce()
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY)
  })

  it("does not evict the cache when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    await updateSchedule(SCHEDULE_ID, { startTime: "10:00" })

    expect(mockDel).not.toHaveBeenCalled()
  })

  it("does not evict the cache when the Prisma transaction throws", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    // schedule.findUnique returns a schedule whose parent belongs to another user
    mockPrisma.schedule.findUnique.mockResolvedValue(makeSchedule(OTHER_USER_ID))

    await expect(updateSchedule(SCHEDULE_ID, { startTime: "10:00" })).rejects.toThrow()

    expect(mockDel).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// deleteSchedule
// ---------------------------------------------------------------------------

describe("deleteSchedule — cache invalidation", () => {
  it("evicts user:rules:{userId} after a successful deletion", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.schedule.findUnique.mockResolvedValue(makeSchedule())
    mockPrisma.schedule.delete.mockResolvedValue(undefined)

    await deleteSchedule(SCHEDULE_ID)

    expect(mockDel).toHaveBeenCalledOnce()
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY)
  })

  it("does not evict the cache when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    await deleteSchedule(SCHEDULE_ID)

    expect(mockDel).not.toHaveBeenCalled()
  })

  it("does not evict the cache when the Prisma transaction throws", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.schedule.findUnique.mockResolvedValue(makeSchedule(OTHER_USER_ID))

    await expect(deleteSchedule(SCHEDULE_ID)).rejects.toThrow()

    expect(mockDel).not.toHaveBeenCalled()
  })
})