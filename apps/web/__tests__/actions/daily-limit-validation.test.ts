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
import { createTimeLimit } from "@/lib/actions/time-limits"

const mockAuth = auth as unknown as Mock
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  timeLimit: {
    create: ReturnType<typeof vi.fn>
  }
}

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(AUTHED_SESSION)
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  )
})

describe("createTimeLimit — daily limit validation", () => {
  it("rejects string characters as dailyLimit with a field error", async () => {
    const result = await createTimeLimit({
      domain: "example.com",
      dailyLimit: "abc",
    })
    expect(result.success).toBe(false)
    if (!result.success && typeof result.error === "object") {
      expect(result.error).toHaveProperty("dailyLimit")
    }
  })

  it("rejects negative numbers as dailyLimit with a field error", async () => {
    const result = await createTimeLimit({
      domain: "example.com",
      dailyLimit: -5,
    })
    expect(result.success).toBe(false)
    if (!result.success && typeof result.error === "object") {
      expect(result.error).toHaveProperty("dailyLimit")
    }
  })

  it("rejects decimal numbers as dailyLimit with a field error", async () => {
    const result = await createTimeLimit({
      domain: "example.com",
      dailyLimit: 2.5,
    })
    expect(result.success).toBe(false)
    if (!result.success && typeof result.error === "object") {
      expect(result.error).toHaveProperty("dailyLimit")
    }
  })

  it("rejects zero as dailyLimit with a field error", async () => {
    const result = await createTimeLimit({
      domain: "example.com",
      dailyLimit: 0,
    })
    expect(result.success).toBe(false)
    if (!result.success && typeof result.error === "object") {
      expect(result.error).toHaveProperty("dailyLimit")
    }
  })

  it("accepts null dailyLimit for an absolute block", async () => {
    mockPrisma.timeLimit.create.mockResolvedValue({
      id: "clh3q5g0o0001qmij2z3m4n5k",
      userId: USER_ID,
      domain: "example.com",
      dailyLimit: null,
      isActive: true,
    })

    const result = await createTimeLimit({
      domain: "example.com",
      dailyLimit: null,
    })
    expect(result.success).toBe(true)
    expect(mockPrisma.timeLimit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dailyLimit: null }),
    })
  })

  it("accepts a positive integer dailyLimit for a time-allowance rule", async () => {
    mockPrisma.timeLimit.create.mockResolvedValue({
      id: "clh3q5g0o0001qmij2z3m4n5k",
      userId: USER_ID,
      domain: "example.com",
      dailyLimit: 45,
      isActive: true,
    })

    const result = await createTimeLimit({
      domain: "example.com",
      dailyLimit: 45,
    })
    expect(result.success).toBe(true)
    expect(mockPrisma.timeLimit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dailyLimit: 45 }),
    })
  })

  it("returns field-level errors, not a generic error string", async () => {
    const result = await createTimeLimit({
      domain: "example.com",
      dailyLimit: "not-a-number",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(typeof result.error).toBe("object")
      expect(result.error).not.toBe("Unauthorized")
    }
  })
})
