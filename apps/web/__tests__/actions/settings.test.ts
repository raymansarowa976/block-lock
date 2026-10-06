import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
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
  getUserSettings,
  updateHardLockMode,
  deleteUserAccount,
} from "@/lib/actions/settings"

const mockAuth = auth as unknown as Mock
const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const USER_EMAIL = "test@example.com"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

function makeUser(overrides = {}) {
  return {
    id: USER_ID,
    email: USER_EMAIL,
    emailVerified: null,
    name: "Test User",
    image: null,
    hardLockMode: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getUserSettings
// ---------------------------------------------------------------------------

describe("getUserSettings", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await getUserSettings()
    expect(result).toEqual({ success: false, error: "Unauthorized" })
  })

  it("returns user settings for authenticated user", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    const user = makeUser()
    mockPrisma.user.findUnique.mockResolvedValue(user)

    const result = await getUserSettings()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(
        expect.objectContaining({
          email: USER_EMAIL,
          name: "Test User",
          hardLockMode: false,
        }),
      )
    }
  })

  it("returns error when user not found", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const result = await getUserSettings()
    expect(result).toEqual({ success: false, error: "User not found" })
  })
})

// ---------------------------------------------------------------------------
// updateHardLockMode
// ---------------------------------------------------------------------------

describe("updateHardLockMode", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await updateHardLockMode(true)
    expect(result).toEqual({ success: false, error: "Unauthorized" })
  })

  it("enables hard lock mode", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.update.mockResolvedValue(makeUser({ hardLockMode: true }))

    const result = await updateHardLockMode(true)
    expect(result).toEqual({ success: true })
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { hardLockMode: true },
    })
  })

  it("disables hard lock mode", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.update.mockResolvedValue(makeUser({ hardLockMode: false }))

    const result = await updateHardLockMode(false)
    expect(result).toEqual({ success: true })
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { hardLockMode: false },
    })
  })
})

// ---------------------------------------------------------------------------
// deleteUserAccount
// ---------------------------------------------------------------------------

describe("deleteUserAccount", () => {
  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await deleteUserAccount(USER_EMAIL)
    expect(result).toEqual({ success: false, error: "Unauthorized" })
  })

  it("returns error when confirmation email does not match", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser())

    const result = await deleteUserAccount("wrong@example.com")
    expect(result).toEqual({ success: false, error: "Email does not match" })
  })

  it("deletes user via cascading delete when confirmation email matches", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser())
    mockPrisma.user.delete.mockResolvedValue(undefined)

    const result = await deleteUserAccount(USER_EMAIL)
    expect(result).toEqual({ success: true })
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { id: USER_ID },
    })
  })

  it("performs case-insensitive email comparison", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser())
    mockPrisma.user.delete.mockResolvedValue(undefined)

    const result = await deleteUserAccount("TEST@EXAMPLE.COM")
    expect(result).toEqual({ success: true })
  })

  it("invalidates redis cache after deletion", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser())
    mockPrisma.user.delete.mockResolvedValue(undefined)

    const { redis } = await import("@/lib/redis")
    const mockRedis = redis as unknown as { del: ReturnType<typeof vi.fn> }

    await deleteUserAccount(USER_EMAIL)
    expect(mockRedis.del).toHaveBeenCalledWith(`user:rules:${USER_ID}`)
  })

  it("does not delete user when email does not match", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser())

    await deleteUserAccount("wrong@example.com")
    expect(mockPrisma.user.delete).not.toHaveBeenCalled()
  })

  // Regression coverage for the bug where an unreachable Upstash host
  // (getaddrinfo ENOTFOUND ...) made redis.del() reject, crashing the whole
  // action even though the account had already been deleted from Postgres.
  it("still returns success when redis.del rejects (Redis outage)", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockPrisma.user.findUnique.mockResolvedValue(makeUser())
    mockPrisma.user.delete.mockResolvedValue(undefined)

    const { redis } = await import("@/lib/redis")
    const mockRedis = redis as unknown as { del: ReturnType<typeof vi.fn> }
    mockRedis.del.mockRejectedValueOnce(
      new Error("getaddrinfo ENOTFOUND light-aardvark-72428.upstash.io"),
    )

    const result = await deleteUserAccount(USER_EMAIL)
    expect(result).toEqual({ success: true })
  })
})