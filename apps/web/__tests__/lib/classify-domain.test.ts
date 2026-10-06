import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/lib/ai/embeddings", () => ({ generateDomainEmbedding: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    domainEmbedding: { findUnique: vi.fn() },
    timeLimit: { upsert: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from "@/lib/prisma"
import { generateDomainEmbedding } from "@/lib/ai/embeddings"
import { classifyDomain, similarityFromDistance, SIMILARITY_THRESHOLD } from "@/lib/classification/classify-domain"

const mockGenerateEmbedding = generateDomainEmbedding as unknown as Mock
const mockPrisma = prisma as unknown as {
  domainEmbedding: { findUnique: ReturnType<typeof vi.fn> }
  timeLimit: { upsert: ReturnType<typeof vi.fn> }
  $executeRaw: ReturnType<typeof vi.fn>
  $queryRaw: ReturnType<typeof vi.fn>
}

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const DOMAIN = "doomscroll.example.com"
const FAKE_EMBEDDING = Array.from({ length: 1536 }, (_, i) => i / 1536)

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// similarityFromDistance — converts pgvector L2 distance (`<->`) on
// unit-norm embeddings into a cosine-similarity score in [-1, 1]
// ---------------------------------------------------------------------------

describe("similarityFromDistance", () => {
  it("returns 1 for identical (zero-distance) vectors", () => {
    expect(similarityFromDistance(0)).toBeCloseTo(1)
  })

  it("returns 0 for orthogonal unit vectors (distance = sqrt(2))", () => {
    expect(similarityFromDistance(Math.SQRT2)).toBeCloseTo(0)
  })

  it("returns -1 for opposite unit vectors (distance = 2)", () => {
    expect(similarityFromDistance(2)).toBeCloseTo(-1)
  })
})

// ---------------------------------------------------------------------------
// classifyDomain — embedding cache
// ---------------------------------------------------------------------------

describe("classifyDomain – embedding cache", () => {
  it("generates and stores an embedding when the domain has none cached", async () => {
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue(null)
    mockGenerateEmbedding.mockResolvedValue(FAKE_EMBEDDING)
    mockPrisma.$executeRaw.mockResolvedValue(1)
    mockPrisma.$queryRaw.mockResolvedValue([])

    await classifyDomain(USER_ID, DOMAIN)

    expect(mockGenerateEmbedding).toHaveBeenCalledWith(DOMAIN)
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce()
  })

  it("generates a 1536-dimensional embedding", async () => {
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue(null)
    mockGenerateEmbedding.mockResolvedValue(FAKE_EMBEDDING)
    mockPrisma.$executeRaw.mockResolvedValue(1)
    mockPrisma.$queryRaw.mockResolvedValue([])

    await classifyDomain(USER_ID, DOMAIN)

    const embeddingArg = mockGenerateEmbedding.mock.results[0].value
    await expect(embeddingArg).resolves.toHaveLength(1536)
  })

  it("reuses a cached embedding instead of generating a new one", async () => {
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue({ id: "e1", domain: DOMAIN })
    mockPrisma.$queryRaw.mockResolvedValue([])

    await classifyDomain(USER_ID, DOMAIN)

    expect(mockGenerateEmbedding).not.toHaveBeenCalled()
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// classifyDomain – similarity search (pgvector `<->` against baselines)
// ---------------------------------------------------------------------------

describe("classifyDomain – similarity search", () => {
  it("queries the database for the nearest distraction baseline using the domain", async () => {
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue({ id: "e1", domain: DOMAIN })
    mockPrisma.$queryRaw.mockResolvedValue([])

    await classifyDomain(USER_ID, DOMAIN)

    expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce()
    const queryArgs = mockPrisma.$queryRaw.mock.calls[0]
    const sqlText = (queryArgs[0] as TemplateStringsArray).join("?")
    expect(sqlText).toContain("<->")
    expect(queryArgs).toContain(DOMAIN)
  })

  it("returns an unmatched, unblocked result when there are no baselines", async () => {
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue({ id: "e1", domain: DOMAIN })
    mockPrisma.$queryRaw.mockResolvedValue([])

    const result = await classifyDomain(USER_ID, DOMAIN)

    expect(result).toEqual({ domain: DOMAIN, matched: false, label: null, similarity: null, blocked: false })
    expect(mockPrisma.timeLimit.upsert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// classifyDomain – confidence threshold & auto-blocking
// ---------------------------------------------------------------------------

describe("classifyDomain – confidence threshold", () => {
  // distance such that similarityFromDistance(d) ≈ 0.9 (above the 0.85 threshold)
  const HIGH_CONFIDENCE_DISTANCE = Math.sqrt(2 * (1 - 0.9))
  // distance such that similarityFromDistance(d) ≈ 0.5 (below the 0.85 threshold)
  const LOW_CONFIDENCE_DISTANCE = Math.sqrt(2 * (1 - 0.5))

  it("does not auto-block when similarity is below the confidence threshold", async () => {
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue({ id: "e1", domain: DOMAIN })
    mockPrisma.$queryRaw.mockResolvedValue([{ label: "social media", distance: LOW_CONFIDENCE_DISTANCE }])

    const result = await classifyDomain(USER_ID, DOMAIN)

    expect(result.matched).toBe(false)
    expect(result.blocked).toBe(false)
    expect(mockPrisma.timeLimit.upsert).not.toHaveBeenCalled()
  })

  it("auto-blocks the domain when similarity crosses the 85% confidence threshold", async () => {
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue({ id: "e1", domain: DOMAIN })
    mockPrisma.$queryRaw.mockResolvedValue([{ label: "social media", distance: HIGH_CONFIDENCE_DISTANCE }])
    mockPrisma.timeLimit.upsert.mockResolvedValue({ id: "tl-1", userId: USER_ID, domain: DOMAIN, dailyLimit: null, isActive: true })

    const result = await classifyDomain(USER_ID, DOMAIN)

    expect(result.matched).toBe(true)
    expect(result.blocked).toBe(true)
    expect(result.label).toBe("social media")
    expect(result.similarity).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD)
  })

  it("creates an always-on block (no daily allowance) for the matched domain, scoped to the user", async () => {
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue({ id: "e1", domain: DOMAIN })
    mockPrisma.$queryRaw.mockResolvedValue([{ label: "social media", distance: HIGH_CONFIDENCE_DISTANCE }])
    mockPrisma.timeLimit.upsert.mockResolvedValue({ id: "tl-1" })

    await classifyDomain(USER_ID, DOMAIN)

    const args = mockPrisma.timeLimit.upsert.mock.calls[0][0]
    expect(args.create).toMatchObject({ userId: USER_ID, domain: DOMAIN, dailyLimit: null, isActive: true })
  })

  it("treats a similarity exactly at the threshold as a match", async () => {
    const exactDistance = Math.sqrt(2 * (1 - SIMILARITY_THRESHOLD))
    mockPrisma.domainEmbedding.findUnique.mockResolvedValue({ id: "e1", domain: DOMAIN })
    mockPrisma.$queryRaw.mockResolvedValue([{ label: "social media", distance: exactDistance }])
    mockPrisma.timeLimit.upsert.mockResolvedValue({ id: "tl-1" })

    const result = await classifyDomain(USER_ID, DOMAIN)

    expect(result.matched).toBe(true)
    expect(result.blocked).toBe(true)
  })
})
