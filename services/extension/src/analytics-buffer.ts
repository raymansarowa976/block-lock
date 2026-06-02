export interface UsageEntry {
  domain: string
  startedAt: number
  duration: number
}

const activeTabs = new Map<number, { domain: string; startedAt: number }>()

function extractDomain(url: string): string | null {
  try {
    const { hostname } = new URL(url)
    return hostname || null
  } catch {
    return null
  }
}

export async function trackNavigation(
  tabId: number,
  url: string,
  timestamp: number,
): Promise<void> {
  const domain = extractDomain(url)
  if (!domain) return

  const previous = activeTabs.get(tabId)

  if (previous) {
    const result = await chrome.storage.local.get("analyticsBuffer")
    const buffer: UsageEntry[] = [...(result.analyticsBuffer ?? [])]
    buffer.push({
      domain: previous.domain,
      startedAt: previous.startedAt,
      duration: timestamp - previous.startedAt,
    })
    await chrome.storage.local.set({ analyticsBuffer: buffer })
  }

  activeTabs.set(tabId, { domain, startedAt: timestamp })
}

export function registerTabListeners(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== "complete" || !changeInfo.url) return
    trackNavigation(tabId, changeInfo.url, Date.now())
  })
}