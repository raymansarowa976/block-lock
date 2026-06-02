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
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/redis", () => ({ redis: { del: vi.fn() } }))

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import {
  createTimeLimit,
  updateTimeLimit,
  deleteTimeLimit,
} from "@/lib/actions/time-limits"

const mockAuth = auth as unknown as Mock
// Prisma is mocked as a plain object — access properties directly
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  timeLimit: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
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
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: transaction executes the callback with the mocked prisma as tx
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  )
})

// ---------------------------------------------------------------------------
// createTimeLimit
// ---------------------------------------------------------------------------

describe("createTimeLimit", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await createTimeLimit({ domain: "example.com", dailyLimit: 30 })
    expect(result).toEqual({ success: false, error: "Unauthorized" })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("returns field errors for an invalid domain", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const result = await createTimeLimit({ domain: "not a domain!!!", dailyLimit: 30 })
    expect(result.success).toBe(false)
    if (!result.success && typeof result.error === "object") {
      expect(result.error).toHaveProperty("domain")
    }
  })

  it("returns field errors for a zero dailyLimit", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const result = await createTimeLimit({ domain: "example.com", dailyLimit: 0 })
    expect(result.success).toBe(false)
  })

  it("creates a time limit and returns it on valid input", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const created = makeTimeLimit()
    mockPrisma.timeLimit.create.mockResolvedValue(created)

    const result = await createTimeLimit({ domain: "example.com", dailyLimit: 30 })
    expect(result).toEqual({ success: true, data: created })
    expect(mockPrisma.timeLimit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, domain: "example.com" }),
    })
  })

  it("creates an unconditional block when dailyLimit is null", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const created = makeTimeLimit({ dailyLimit: null })
    mockPrisma.timeLimit.create.mockResolvedValue(created)

    const result = await createTimeLimit({ domain: "example.com", dailyLimit: null })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// updateTimeLimit
// ---------------------------------------------------------------------------

describe("updateTimeLimit", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await updateTimeLimit(LIMIT_ID, { isActive: false })
    expect(result).toEqual({ success: false, error: "Unauthorized" })
  })

  it("returns field errors for invalid update data", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const result = await updateTimeLimit(LIMIT_ID, { domain: "bad domain" })
    expect(result.success).toBe(false)
  })

  it("rejects update when time limit belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({ userId: "other-user-id" }),
    )
    await expect(updateTimeLimit(LIMIT_ID, { isActive: false })).rejects.toThrow()
  })

  it("rejects update when time limit does not exist", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(null)
    await expect(updateTimeLimit(LIMIT_ID, { isActive: false })).rejects.toThrow()
  })

  it("updates and returns the time limit for the owner", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const existing = makeTimeLimit()
    const updated = makeTimeLimit({ isActive: false })
    mockPrisma.timeLimit.findUnique.mockResolvedValue(existing)
    mockPrisma.timeLimit.update.mockResolvedValue(updated)

    const result = await updateTimeLimit(LIMIT_ID, { isActive: false })
    expect(result).toEqual({ success: true, data: updated })
  })
})

// ---------------------------------------------------------------------------
// deleteTimeLimit
// ---------------------------------------------------------------------------

describe("deleteTimeLimit", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await deleteTimeLimit(LIMIT_ID)
    expect(result).toEqual({ success: false, error: "Unauthorized" })
  })

  it("rejects deletion when time limit belongs to another user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(
      makeTimeLimit({ userId: "other-user-id" }),
    )
    await expect(deleteTimeLimit(LIMIT_ID)).rejects.toThrow()
  })

  it("rejects deletion when time limit does not exist", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(null)
    await expect(deleteTimeLimit(LIMIT_ID)).rejects.toThrow()
  })

  it("deletes the time limit and returns success for the owner", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.timeLimit.findUnique.mockResolvedValue(makeTimeLimit())
    mockPrisma.timeLimit.delete.mockResolvedValue(undefined)

    const result = await deleteTimeLimit(LIMIT_ID)
    expect(result).toEqual({ success: true })
    expect(mockPrisma.timeLimit.delete).toHaveBeenCalledWith({ where: { id: LIMIT_ID } })
  })
})