// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { mockPoolInstance, MockPool, mockAdapterInstance, MockPrismaPg, MockPrismaClient } =
  vi.hoisted(() => {
    const mockPoolInstance = { connect: vi.fn(), end: vi.fn() }
    const MockPool = vi.fn(function () { return mockPoolInstance })

    const mockAdapterInstance = {}
    const MockPrismaPg = vi.fn(function () { return mockAdapterInstance })

    const MockPrismaClient = vi.fn(function () { return {} })

    return { mockPoolInstance, MockPool, mockAdapterInstance, MockPrismaPg, MockPrismaClient }
  })

vi.mock("pg", () => ({ Pool: MockPool }))
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: MockPrismaPg }))
vi.mock("@prisma/client", () => ({ PrismaClient: MockPrismaClient }))

describe("prisma client — production DATABASE_URL configuration", () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.resetModules()
    MockPool.mockClear()
    MockPrismaPg.mockClear()
    MockPrismaClient.mockClear()
    delete (globalThis as unknown as { prisma?: unknown }).prisma
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it("creates a pg Pool with the DATABASE_URL connection string", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/blocklock"

    await import("@/lib/prisma")

    expect(MockPool).toHaveBeenCalledOnce()
    expect(MockPool).toHaveBeenCalledWith({
      connectionString: "postgresql://user:pass@localhost:5432/blocklock",
    })
  })

  it("passes the pg Pool into PrismaPg adapter then passes adapter to PrismaClient", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/blocklock"

    await import("@/lib/prisma")

    expect(MockPrismaPg).toHaveBeenCalledWith(mockPoolInstance)
    expect(MockPrismaClient).toHaveBeenCalledWith(
      expect.objectContaining({ adapter: mockAdapterInstance }),
    )
  })

  it("does not cache the prisma instance on globalThis in production", async () => {
    ;(process.env as Record<string, string>).NODE_ENV = "production"
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/blocklock"

    const globalForPrisma = globalThis as unknown as { prisma?: unknown }
    delete globalForPrisma.prisma

    await import("@/lib/prisma")

    expect(globalForPrisma.prisma).toBeUndefined()
  })
})