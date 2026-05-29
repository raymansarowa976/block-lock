import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    timeLimit: { findUnique: vi.fn() },
    schedule: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/lib/actions/schedules"

const mockAuth = auth as unknown as Mock
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  timeLimit: { findUnique: ReturnType<typeof vi.fn> }
  schedule: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const OTHER_USER_ID = "clh3q5g0o0002qmij2z3m4n5k"
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const SCHEDULE_ID = "clh3q5g0o0003qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

const VALID_SCHEDULE_INPUT = {
  timeLimitId: LIMIT_ID,
  startTime: "09:00",
  endTime: "17:00",
  daysOfWeek: [1, 2, 3, 4, 5],
}

function makeTimeLimit(userId = USER_ID) {
  return { id: LIMIT_ID, userId, domain: "example.com", dailyLimit: 30, isActive: true }
}

function makeSchedule() {
  return {
    id: SCHEDULE_ID,
    timeLimitId: LIMIT_ID,
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: [1, 2, 3, 4, 5],
    createdAt: new Date(),
    updatedAt: new Date(),
    timeLimit: makeTimeLimit(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  )
})

// ---------------------------------------------------------------------------
// createSchedule
// ---------------------------------------------------------------------------

describe("createSchedule", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await createSchedule(VALID_SCHEDULE_INPUT)
    expect(result).toEqual({ success: false, error: "Unauthorized" })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("returns field errors for an invalid time format", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const result = await createSchedule({ ...VALID_SCHEDULE_INPUT, startTime: "9am" })
    expect(result.success).toBe(false)
  })

  it("returns field errors for an empty daysOfWeek array", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const result = await createSchedule({ ...VALID_SCHEDULE_INPUT, daysOfWeek: [] })
    expect(result.success).toBe(false)
  })

  it("returns field errors for an out-of-range day", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const result = await createSchedule({ ...VALID_SCHEDULE_INPUT, daysOfWeek: [7] })
    expect(result.success).toBe(false)
  })

  it("rejects creation when parent TimeLimit belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit(OTHER_USER_ID))
    await expect(createSchedule(VALID_SCHEDULE_INPUT)).rejects.toThrow()
  })

  it("rejects creation when parent TimeLimit does not exist", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(null)
    await expect(createSchedule(VALID_SCHEDULE_INPUT)).rejects.toThrow()
  })

  it("creates the schedule and returns it when input is valid", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const created = makeSchedule()
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit())
    mockPrisma.schedule.create.mockResolvedValue(created)

    const result = await createSchedule(VALID_SCHEDULE_INPUT)
    expect(result).toEqual({ success: true, data: created })
    expect(mockPrisma.schedule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ timeLimitId: LIMIT_ID }),
    })
  })
})

// ---------------------------------------------------------------------------
// updateSchedule
// ---------------------------------------------------------------------------

describe("updateSchedule", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await updateSchedule(SCHEDULE_ID, { daysOfWeek: [0] })
    expect(result).toEqual({ success: false, error: "Unauthorized" })
  })

  it("returns field errors for an invalid time format", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const result = await updateSchedule(SCHEDULE_ID, { startTime: "9am" })
    expect(result.success).toBe(false)
  })

  it("rejects update when schedule belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.schedule.findUnique.mockResolvedValue({
      ...makeSchedule(),
      timeLimit: makeTimeLimit(OTHER_USER_ID),
    })
    await expect(updateSchedule(SCHEDULE_ID, { daysOfWeek: [0] })).rejects.toThrow()
  })

  it("rejects update when schedule does not exist", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.schedule.findUnique.mockResolvedValue(null)
    await expect(updateSchedule(SCHEDULE_ID, { daysOfWeek: [0] })).rejects.toThrow()
  })

  it("updates and returns the schedule for the owner", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const existing = makeSchedule()
    const updated = { ...existing, daysOfWeek: [0, 6] }
    mockPrisma.schedule.findUnique.mockResolvedValue(existing)
    mockPrisma.schedule.update.mockResolvedValue(updated)

    const result = await updateSchedule(SCHEDULE_ID, { daysOfWeek: [0, 6] })
    expect(result).toEqual({ success: true, data: updated })
  })
})

// ---------------------------------------------------------------------------
// deleteSchedule
// ---------------------------------------------------------------------------

describe("deleteSchedule", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await deleteSchedule(SCHEDULE_ID)
    expect(result).toEqual({ success: false, error: "Unauthorized" })
  })

  it("rejects deletion when schedule belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.schedule.findUnique.mockResolvedValue({
      ...makeSchedule(),
      timeLimit: makeTimeLimit(OTHER_USER_ID),
    })
    await expect(deleteSchedule(SCHEDULE_ID)).rejects.toThrow()
  })

  it("rejects deletion when schedule does not exist", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.schedule.findUnique.mockResolvedValue(null)
    await expect(deleteSchedule(SCHEDULE_ID)).rejects.toThrow()
  })

  it("deletes the schedule and returns success for the owner", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.schedule.findUnique.mockResolvedValue(makeSchedule())
    mockPrisma.schedule.delete.mockResolvedValue(undefined)

    const result = await deleteSchedule(SCHEDULE_ID)
    expect(result).toEqual({ success: true })
    expect(mockPrisma.schedule.delete).toHaveBeenCalledWith({ where: { id: SCHEDULE_ID } })
  })
})