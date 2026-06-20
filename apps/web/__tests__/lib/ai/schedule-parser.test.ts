import { describe, it, expect, vi, beforeEach } from "vitest"
import { AIScheduleParseResultSchema } from "@block-lock/shared-types"

const { mockGenerateObject, mockAiModel, mockOpenaiModel } = vi.hoisted(() => {
  const mockAiModel = { modelId: "gpt-4o-mini" }
  return {
    mockGenerateObject: vi.fn(),
    mockAiModel,
    mockOpenaiModel: vi.fn(() => mockAiModel),
  }
})

vi.mock("ai", () => ({ generateObject: mockGenerateObject }))
vi.mock("@ai-sdk/openai", () => ({ openai: mockOpenaiModel }))

import { parseScheduleFromPrompt } from "@/lib/ai/schedule-parser"

const VALID_RESULT = {
  blocks: [
    {
      domain: "facebook.com",
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: [1, 2, 3, 4, 5],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGenerateObject.mockResolvedValue({ object: VALID_RESULT })
})

// ---------------------------------------------------------------------------
// parseScheduleFromPrompt – model invocation contract
// ---------------------------------------------------------------------------

describe("parseScheduleFromPrompt – model invocation", () => {
  it("calls generateObject exactly once per prompt", async () => {
    await parseScheduleFromPrompt("block social media 9 to 5 weekdays")
    expect(mockGenerateObject).toHaveBeenCalledTimes(1)
  })

  it("passes the openai-provisioned model instance to generateObject", async () => {
    await parseScheduleFromPrompt("block social media 9 to 5 weekdays")
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({ model: mockAiModel }),
    )
  })

  it("passes the user's prompt verbatim to generateObject", async () => {
    const prompt = "block social media 9 to 5 weekdays"
    await parseScheduleFromPrompt(prompt)
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({ prompt }),
    )
  })

  it("passes AIScheduleParseResultSchema as the structured-output schema", async () => {
    await parseScheduleFromPrompt("block social media 9 to 5 weekdays")
    const call = mockGenerateObject.mock.calls[0][0]
    expect(call.schema).toBe(AIScheduleParseResultSchema)
  })

  it("includes a non-empty system prompt describing the blocking rule format", async () => {
    await parseScheduleFromPrompt("block social media 9 to 5 weekdays")
    const call = mockGenerateObject.mock.calls[0][0]
    expect(typeof call.system).toBe("string")
    expect(call.system.trim().length).toBeGreaterThan(0)
  })

  it("system prompt instructs the model to use HH:MM time and integer day-of-week values", async () => {
    await parseScheduleFromPrompt("block social media 9 to 5 weekdays")
    const { system } = mockGenerateObject.mock.calls[0][0]
    // The system prompt must explain the expected time/day encoding to the model.
    expect(system).toMatch(/HH:MM|24.hour/i)
    expect(system).toMatch(/0.{0,5}Sunday|Sunday.{0,5}0/i)
  })
})

// ---------------------------------------------------------------------------
// parseScheduleFromPrompt – return value
// ---------------------------------------------------------------------------

describe("parseScheduleFromPrompt – return value", () => {
  it("returns the parsed object extracted from the AI SDK response", async () => {
    const result = await parseScheduleFromPrompt("block social media 9 to 5 weekdays")
    expect(result).toEqual(VALID_RESULT)
  })

  it("returns multi-block results when the model expands a category into several domains", async () => {
    const multiBlock = {
      blocks: [
        { domain: "facebook.com", startTime: "09:00", endTime: "17:00", daysOfWeek: [1, 2, 3, 4, 5] },
        { domain: "instagram.com", startTime: "09:00", endTime: "17:00", daysOfWeek: [1, 2, 3, 4, 5] },
        { domain: "twitter.com", startTime: "09:00", endTime: "17:00", daysOfWeek: [1, 2, 3, 4, 5] },
      ],
    }
    mockGenerateObject.mockResolvedValue({ object: multiBlock })

    const result = await parseScheduleFromPrompt("block all social media on weekdays 9 to 5")
    expect(result.blocks).toHaveLength(3)
    expect(result.blocks.map((b) => b.domain)).toContain("instagram.com")
  })

  it("preserves weekend-only daysOfWeek arrays from the model", async () => {
    const weekendOnly = {
      blocks: [{ domain: "reddit.com", startTime: "00:00", endTime: "23:59", daysOfWeek: [0, 6] }],
    }
    mockGenerateObject.mockResolvedValue({ object: weekendOnly })

    const result = await parseScheduleFromPrompt("block reddit on weekends all day")
    expect(result.blocks[0].daysOfWeek).toEqual([0, 6])
  })
})

// ---------------------------------------------------------------------------
// parseScheduleFromPrompt – error propagation
// ---------------------------------------------------------------------------

describe("parseScheduleFromPrompt – error propagation", () => {
  it("propagates API rate-limit errors from the model provider", async () => {
    mockGenerateObject.mockRejectedValue(new Error("API rate limit exceeded"))
    await expect(parseScheduleFromPrompt("block social media")).rejects.toThrow(
      "API rate limit exceeded",
    )
  })

  it("propagates network connectivity errors", async () => {
    mockGenerateObject.mockRejectedValue(new Error("ECONNREFUSED: connection refused"))
    await expect(parseScheduleFromPrompt("any prompt")).rejects.toThrow()
  })

  it("propagates schema-generation errors thrown by the AI SDK", async () => {
    // The AI SDK throws when it cannot coerce the model output into the required schema.
    mockGenerateObject.mockRejectedValue(new Error("AI_NoObjectGeneratedError"))
    await expect(parseScheduleFromPrompt("block social media")).rejects.toThrow()
  })

  it("propagates timeout errors", async () => {
    mockGenerateObject.mockRejectedValue(new Error("Request timed out after 30000ms"))
    await expect(parseScheduleFromPrompt("block social media 9 to 5")).rejects.toThrow()
  })
})