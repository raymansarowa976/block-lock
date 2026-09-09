export interface DailyUsageEntry {
  date: string
  minutesUsed: number
}

export type DailyUsageMap = Record<string, DailyUsageEntry>

const STORAGE_KEY = "dailyUsage"

export function todayKey(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export async function getMinutesUsedToday(domain: string, now: Date = new Date()): Promise<number> {
  const { dailyUsage } = await chrome.storage.local.get(STORAGE_KEY)
  const usage: DailyUsageMap = dailyUsage ?? {}
  const entry = usage[domain]
  if (!entry || entry.date !== todayKey(now)) return 0
  return entry.minutesUsed
}

export async function addUsageMinutes(
  domain: string,
  minutes: number,
  now: Date = new Date(),
): Promise<number> {
  const { dailyUsage } = await chrome.storage.local.get(STORAGE_KEY)
  const usage: DailyUsageMap = { ...(dailyUsage ?? {}) }
  const key = todayKey(now)
  const previous = usage[domain]?.date === key ? usage[domain].minutesUsed : 0
  const minutesUsed = previous + minutes

  usage[domain] = { date: key, minutesUsed }
  await chrome.storage.local.set({ [STORAGE_KEY]: usage })

  return minutesUsed
}
