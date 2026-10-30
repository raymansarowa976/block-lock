export interface UsageEntry {
  domain: string
  startedAt: number
  duration: number
}

interface ActiveVisit {
  tabId: number
  domain: string
  startedAt: number
}

// Only the tab the user is looking at accrues time, so there is at most one
// open visit. It lives in chrome.storage.session rather than module memory
// because Chrome tears down an idle MV3 service worker after ~30 s, which
// would otherwise drop the visit before it is recorded.
const VISIT_KEY = "activeVisit"

function extractDomain(url: string): string | null {
  try {
    const { hostname } = new URL(url)
    return hostname || null
  } catch {
    return null
  }
}

// Tab events arrive close together (a switch can fire onActivated and
// onUpdated back to back) and each does a read-modify-write on storage, so
// they run one at a time.
let queue: Promise<unknown> = Promise.resolve()

function serialise(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task)
  queue = run.catch(() => {})
  return run
}

async function closeVisit(timestamp: number): Promise<ActiveVisit | null> {
  const { [VISIT_KEY]: visit } = await chrome.storage.session.get(VISIT_KEY)
  if (!visit) return null

  const result = await chrome.storage.local.get("analyticsBuffer")
  const buffer: UsageEntry[] = [...(result.analyticsBuffer ?? [])]
  buffer.push({
    domain: visit.domain,
    startedAt: visit.startedAt,
    duration: timestamp - visit.startedAt,
  })
  await chrome.storage.local.set({ analyticsBuffer: buffer })
  return visit
}

async function switchVisit(tabId: number, url: string | undefined, timestamp: number): Promise<void> {
  await closeVisit(timestamp)
  const domain = url ? extractDomain(url) : null
  const visit: ActiveVisit | null = domain ? { tabId, domain, startedAt: timestamp } : null
  await chrome.storage.session.set({ [VISIT_KEY]: visit })
}

export function trackNavigation(tabId: number, url: string, timestamp: number): Promise<void> {
  return serialise(() => switchVisit(tabId, url, timestamp))
}

export function trackActivation(tabId: number, timestamp: number): Promise<void> {
  return serialise(async () => {
    // The tab can close between the event and this lookup.
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    await switchVisit(tabId, tab?.url, timestamp)
  })
}

export function trackTabClosed(tabId: number, timestamp: number): Promise<void> {
  return serialise(async () => {
    const { [VISIT_KEY]: visit } = await chrome.storage.session.get(VISIT_KEY)
    if (visit?.tabId !== tabId) return
    await closeVisit(timestamp)
    await chrome.storage.session.set({ [VISIT_KEY]: null })
  })
}

export function registerTabListeners(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !changeInfo.url || !tab.active) return
    return trackNavigation(tabId, changeInfo.url, Date.now())
  })
  chrome.tabs.onActivated.addListener(({ tabId }) => trackActivation(tabId, Date.now()))
  chrome.tabs.onRemoved.addListener((tabId) => trackTabClosed(tabId, Date.now()))
}
