import { describe, it, expect, vi, beforeEach } from "vitest"

// text-embedding-3-small always produces exactly 1536 dimensions.
const EXPECTED_DIMENSIONS = 1536

const { mockEmbed, mockEmbeddingModelInstance, mockOpenaiEmbedding, mockOpenai } = vi.hoisted(() => {
  const mockEmbeddingModelInstance = { modelId: "text-embedding-3-small" }
  const mockOpenaiEmbedding = vi.fn(() => mockEmbeddingModelInstance)
  const mockOpenai = vi.fn()
  // @ts-expect-error attaching .embedding() method to the mock openai callable
  mockOpenai.embedding = mockOpenaiEmbedding
  return { mockEmbed: vi.fn(), mockEmbeddingModelInstance, mockOpenaiEmbedding, mockOpenai }
})

vi.mock("ai", () => ({ embed: mockEmbed }))
vi.mock("@ai-sdk/openai", () => ({ openai: mockOpenai }))

import { generateDomainEmbedding } from "@/lib/ai/embeddings"

const VALID_EMBEDDING = Array.from({ length: EXPECTED_DIMENSIONS }, (_, i) => Math.sin(i) * 0.5)

beforeEach(() => {
  vi.clearAllMocks()
  mockEmbed.mockResolvedValue({ embedding: VALID_EMBEDDING })
})

// ---------------------------------------------------------------------------
// generateDomainEmbedding – model invocation contract
// ---------------------------------------------------------------------------

describe("generateDomainEmbedding – model invocation", () => {
  it("uses the text-embedding-3-small model via openai.embedding()", async () => {
    await generateDomainEmbedding("facebook.com")
    expect(mockOpenaiEmbedding).toHaveBeenCalledWith("text-embedding-3-small")
    expect(mockEmbed).toHaveBeenCalledWith(
      expect.objectContaining({ model: mockEmbeddingModelInstance }),
    )
  })

  it("passes the domain string as the value to embed", async () => {
    await generateDomainEmbedding("reddit.com")
    expect(mockEmbed).toHaveBeenCalledWith(expect.objectContaining({ value: "reddit.com" }))
  })

  it("calls embed exactly once per domain", async () => {
    await generateDomainEmbedding("tiktok.com")
    expect(mockEmbed).toHaveBeenCalledTimes(1)
  })

  it("returns the embedding array from the model response", async () => {
    const result = await generateDomainEmbedding("facebook.com")
    expect(result).toEqual(VALID_EMBEDDING)
    expect(result).toHaveLength(EXPECTED_DIMENSIONS)
  })

  it("propagates errors thrown by the embedding model", async () => {
    mockEmbed.mockRejectedValue(new Error("embedding model unavailable"))
    await expect(generateDomainEmbedding("facebook.com")).rejects.toThrow(
      "embedding model unavailable",
    )
  })
})

// ---------------------------------------------------------------------------
// generateDomainEmbedding – output validation
//
// These tests document REQUIRED validation behavior that does not yet exist.
// They will FAIL against the current implementation, which returns whatever
// the SDK gives back without inspection.
//
// Motivation: any corrupted embedding that reaches pgvector silently writes
// an unusable vector to the DB, breaking similarity search for that domain
// permanently without raising an error the application can detect.
// ---------------------------------------------------------------------------

describe("generateDomainEmbedding – output validation", () => {
  it("throws when the model returns an empty embedding array", async () => {
    // A zero-length vector cannot be stored in the vector(1536) pgvector column
    // and would cause a silent DB write failure that corrupts classification results.
    mockEmbed.mockResolvedValue({ embedding: [] })
    await expect(generateDomainEmbedding("facebook.com")).rejects.toThrow()
  })

  it("throws when the embedding has fewer than 1536 dimensions", async () => {
    // pgvector enforces fixed-width columns: inserting a vector of the wrong size
    // causes a runtime error at the DB layer that is harder to diagnose than a
    // validation error thrown here at the source.
    mockEmbed.mockResolvedValue({ embedding: Array.from({ length: 128 }, () => 0.1) })
    await expect(generateDomainEmbedding("facebook.com")).rejects.toThrow()
  })

  it("throws when the embedding has more than 1536 dimensions", async () => {
    mockEmbed.mockResolvedValue({ embedding: Array.from({ length: 2048 }, () => 0.1) })
    await expect(generateDomainEmbedding("facebook.com")).rejects.toThrow()
  })

  it("throws when the embedding contains non-numeric string values", async () => {
    // A hallucinated embedding with string values would silently produce NaN
    // in the pgvector literal, corrupting the stored vector.
    mockEmbed.mockResolvedValue({
      embedding: Array.from({ length: EXPECTED_DIMENSIONS }, () => "not-a-number"),
    })
    await expect(generateDomainEmbedding("facebook.com")).rejects.toThrow()
  })

  it("throws when the embedding contains NaN values", async () => {
    const withNaN = Array.from({ length: EXPECTED_DIMENSIONS }, (_, i) => (i === 0 ? NaN : 0.1))
    mockEmbed.mockResolvedValue({ embedding: withNaN })
    await expect(generateDomainEmbedding("facebook.com")).rejects.toThrow()
  })

  it("throws when the model returns null instead of an embedding array", async () => {
    mockEmbed.mockResolvedValue({ embedding: null })
    await expect(generateDomainEmbedding("facebook.com")).rejects.toThrow()
  })

  it("throws when the model returns undefined instead of an embedding array", async () => {
    mockEmbed.mockResolvedValue({ embedding: undefined })
    await expect(generateDomainEmbedding("facebook.com")).rejects.toThrow()
  })

  it("accepts a valid 1536-dimensional numeric embedding without throwing", async () => {
    // Sanity check: the validation must not reject correct model output.
    await expect(generateDomainEmbedding("github.com")).resolves.toEqual(VALID_EMBEDDING)
  })
})