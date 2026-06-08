import { describe, it, expect, vi, beforeEach } from "vitest"
import type { WeeklyUsageSummary } from "@block-lock/shared-types"

const { mockGenerateText, mockEmbeddingModel, mockOpenaiModel } = vi.hoisted(() => {
  const mockEmbeddingModel = { modelId: "gpt-4o-mini" }
  return {
    mockGenerateText: vi.fn(),
    mockEmbeddingModel,
    mockOpenaiModel: vi.fn(() => mockEmbeddingModel),
  }
})

vi.mock("ai", () => ({ generateText: mockGenerateText }))
vi.mock("@ai-sdk/openai", () => ({ openai: mockOpenaiModel }))

import { generateProductivityInsight } from "@/lib/ai/productivity-coach"

const SUMMARY: WeeklyUsageSummary = {
  userId: "clh3q5g0o0000qmij2z3m4n5k",
  periodStart: "2026-05-31T00:00:00.000Z",
  periodEnd: "2026-06-07T00:00:00.000Z",
  domains: [
    { domain: "tiktok.com", totalMinutes: 420, sessionCount: 30, blockedCount: 12, microRelapses: 9 },
    { domain: "github.com", totalMinutes: 180, sessionCount: 14, blockedCount: 0, microRelapses: 0 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGenerateText.mockResolvedValue({ text: "## Weekly briefing\n\nYou relapsed into tiktok.com 9 times." })
})

describe("generateProductivityInsight", () => {
  it("invokes the model with a system prompt and the serialized weekly summary", async () => {
    await generateProductivityInsight(SUMMARY)

    expect(mockGenerateText).toHaveBeenCalledTimes(1)
    const call = mockGenerateText.mock.calls[0][0]

    expect(call.model).toBe(mockEmbeddingModel)
    expect(typeof call.system).toBe("string")
    expect(call.system.length).toBeGreaterThan(0)
    expect(call.prompt).toContain("tiktok.com")
    expect(call.prompt).toContain("microRelapses")
  })

  it("returns the generated markdown text", async () => {
    const result = await generateProductivityInsight(SUMMARY)

    expect(result).toBe("## Weekly briefing\n\nYou relapsed into tiktok.com 9 times.")
  })

  it("trims surrounding whitespace from the model output", async () => {
    mockGenerateText.mockResolvedValue({ text: "\n\n  ## Briefing  \n\n" })

    const result = await generateProductivityInsight(SUMMARY)

    expect(result).toBe("## Briefing")
  })
})
