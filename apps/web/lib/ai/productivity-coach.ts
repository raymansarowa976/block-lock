import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import type { WeeklyUsageSummary } from "@block-lock/shared-types"

const MODEL = "gpt-4o-mini"

const SYSTEM_PROMPT = `You are a digital wellness coach reviewing a user's trailing 7-day browsing telemetry.

You will receive a JSON array of per-domain aggregates, each with:
- domain: the website
- totalMinutes: total time spent there this week
- sessionCount: number of separate visits
- blockedCount: how many of those visits were actively blocked
- microRelapses: visits that began shortly after a block on the same domain — a sign the user kept retrying a site they were just stopped from using

Write a short, encouraging markdown briefing (use headings and bullet points) that:
- Calls out specific focus-drop patterns by name (e.g. "you relapsed into instagram.com 6 times after being blocked")
- Highlights any domains trending in the right direction
- Suggests one or two concrete, achievable adjustments for the coming week

Keep it concise — a few short sections, not an essay. Output markdown only.`

export async function generateProductivityInsight(summary: WeeklyUsageSummary): Promise<string> {
  const { text } = await generateText({
    model: openai(MODEL),
    system: SYSTEM_PROMPT,
    prompt: JSON.stringify(summary.domains),
  })
  return text.trim()
}
