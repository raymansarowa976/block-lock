import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { AIScheduleParseResultSchema, type AIScheduleParseResult } from "@block-lock/shared-types"

const MODEL = "gpt-4o-mini"

const SYSTEM_PROMPT = `You translate a user's natural-language focus/scheduling request into structured website-blocking rules.

Each rule ("block") pairs a single domain with the time window and days of the week it should be blocked:
- domain: a real, fully-qualified website domain (e.g. "facebook.com", "instagram.com", "youtube.com"). Expand categories like "social media" into the well-known domains they refer to — emit one block per domain.
- startTime / endTime: 24-hour "HH:MM" strings.
- daysOfWeek: integers 0-6 where 0 = Sunday … 6 = Saturday. Expand phrases like "weekdays" to [1,2,3,4,5] and "weekends" to [0,6].

Always return at least one block. Never invent fields outside the given schema.`

export async function parseScheduleFromPrompt(prompt: string): Promise<AIScheduleParseResult> {
  const { object } = await generateObject({
    model: openai(MODEL),
    schema: AIScheduleParseResultSchema,
    system: SYSTEM_PROMPT,
    prompt,
  })
  return object
}