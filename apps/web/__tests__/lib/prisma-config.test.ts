// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

describe("prisma client — production DATABASE_URL configuration", () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.resetModules()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it("exports a prisma instance when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/blocklock"

    const { prisma } = await import("@/lib/prisma")

    expect(prisma).toBeDefined()
  })

  it("prisma instance exposes $connect and $disconnect confirming it is a PrismaClient", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/blocklock"

    const { prisma } = await import("@/lib/prisma")

    expect(typeof prisma.$connect).toBe("function")
    expect(typeof prisma.$disconnect).toBe("function")
  })

  it("does not cache the instance on globalThis in production", async () => {
    ;(process.env as Record<string, string>).NODE_ENV = "production"
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/blocklock"

    const globalForPrisma = globalThis as unknown as { prisma?: unknown }
    delete globalForPrisma.prisma

    await import("@/lib/prisma")

    expect(globalForPrisma.prisma).toBeUndefined()
  })
})