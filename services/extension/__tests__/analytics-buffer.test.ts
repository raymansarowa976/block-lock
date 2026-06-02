import { describe, it, expect, vi, beforeEach } from "vitest"
import { registerTabListeners, trackNavigation } from "../src/analytics-buffer"

const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()
const mockTabsOnUpdated = { addListener: vi.fn() }
const mockFetch = vi.fn()

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
  tabs: {
    onUpdated: mockTabsOnUpdated,
  },
})
vi.stubGlobal("fetch", mockFetch)

// Each test gets a unique tab ID to prevent cross-test activeTabs Map pollution
let nextTabId = 0

beforeEach(() => {
  mockStorageGet.mockReset().mockResolvedValue({ analyticsBuffer: [] })
  mockStorageSet.mockReset().mockResolvedValue(undefined)
  mockTabsOnUpdated.addListener.mockReset()
  mockFetch.mockReset()
  nextTabId++
})

// ---------------------------------------------------------------------------
// registerTabListeners – chrome.tabs.onUpdated binding (acceptance criterion 1)
// ---------------------------------------------------------------------------

describe("registerTabListeners – event listener registration", () => {
  it("attaches a listener to chrome.tabs.onUpdated", () => {
    registerTabListeners()
    expect(mockTabsOnUpdated.addListener).toHaveBeenCalledTimes(1)
    expect(mockTabsOnUpdated.addListener).toHaveBeenCalledWith(expect.any(Function))
  })
})

describe("registerTabListeners – listener callback behaviour", () => {
  it("writes to storage when a tab completes loading and the tab was previously tracked", async () => {
    registerTabListeners()
    const listener = mockTabsOnUpdated.addListener.mock.calls[0][0]
    const tabId = nextTabId
    // Prime the tracker so the next navigation on this tab triggers a storage write
    await trackNavigation(tabId, "https://prime.com/", 0)
    mockStorageGet.mockResolvedValue({ analyticsBuffer: [] })
    await listener(tabId, { status: "complete", url: "https://example.com/" }, {})
    expect(mockStorageSet).toHaveBeenCalled()
  })

  it("ignores onUpdated events that carry no URL in changeInfo", async () => {
    registerTabListeners()
    const listener = mockTabsOnUpdated.addListener.mock.calls[0][0]
    await listener(nextTabId, { status: "complete" }, {})
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("ignores onUpdated events whose status is not 'complete'", async () => {
    registerTabListeners()
    const listener = mockTabsOnUpdated.addListener.mock.calls[0][0]
    await listener(nextTabId, { status: "loading", url: "https://example.com/" }, {})
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// trackNavigation – first navigation to a previously unseen tab
// ---------------------------------------------------------------------------

describe("trackNavigation – first navigation to a tab", () => {
  it("does not write to storage on the first navigation (no prior page to finalise)", async () => {
    await trackNavigation(nextTabId, "https://example.com/", 1000)
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// trackNavigation – buffer accumulation (acceptance criterion 2)
// ---------------------------------------------------------------------------

describe("trackNavigation – buffer accumulation on subsequent navigation", () => {
  it("writes to chrome.storage.local when a tab leaves a tracked page", async () => {
    const tabId = nextTabId
    await trackNavigation(tabId, "https://example.com/", 1000)
    await trackNavigation(tabId, "https://another.com/", 1030)
    expect(mockStorageSet).toHaveBeenCalled()
  })

  it("stores entries under the analyticsBuffer key", async () => {
    const tabId = nextTabId
    await trackNavigation(tabId, "https://example.com/", 1000)
    await trackNavigation(tabId, "https://another.com/", 1030)
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ analyticsBuffer: expect.any(Array) }),
    )
  })

  it("appends to the existing buffer rather than replacing it", async () => {
    const tabId = nextTabId
    const existing = [{ domain: "old.com", startedAt: 0, duration: 10 }]
    mockStorageGet.mockResolvedValue({ analyticsBuffer: existing })
    await trackNavigation(tabId, "https://a.com/", 1000)
    mockStorageGet.mockResolvedValue({ analyticsBuffer: existing })
    await trackNavigation(tabId, "https://b.com/", 1030)
    const written = mockStorageSet.mock.calls[0][0].analyticsBuffer
    expect(written.length).toBe(existing.length + 1)
  })

  it("initialises the buffer as an empty array when the storage key is absent", async () => {
    const tabId = nextTabId
    mockStorageGet.mockResolvedValue({})
    await trackNavigation(tabId, "https://a.com/", 1000)
    mockStorageGet.mockResolvedValue({})
    await trackNavigation(tabId, "https://b.com/", 1030)
    const written = mockStorageSet.mock.calls[0][0].analyticsBuffer
    expect(Array.isArray(written)).toBe(true)
    expect(written.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// trackNavigation – entry content
// ---------------------------------------------------------------------------

describe("trackNavigation – entry domain", () => {
  it("stores the hostname only (not path or query string)", async () => {
    const tabId = nextTabId
    await trackNavigation(tabId, "https://example.com/path?q=1#frag", 1000)
    await trackNavigation(tabId, "https://other.com/", 1060)
    const written = mockStorageSet.mock.calls[0][0].analyticsBuffer
    expect(written[written.length - 1].domain).toBe("example.com")
  })

  it("does not write an entry for an unparseable or empty URL", async () => {
    const tabId = nextTabId
    await trackNavigation(tabId, "https://legit.com/", 1000)
    await trackNavigation(tabId, "not-a-url", 1030)
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})

describe("trackNavigation – entry timestamps and duration", () => {
  it("sets startedAt to the timestamp supplied at arrival time", async () => {
    const tabId = nextTabId
    await trackNavigation(tabId, "https://example.com/", 1000)
    await trackNavigation(tabId, "https://other.com/", 1060)
    const written = mockStorageSet.mock.calls[0][0].analyticsBuffer
    expect(written[written.length - 1].startedAt).toBe(1000)
  })

  it("sets duration to the difference between departure and arrival timestamps", async () => {
    const tabId = nextTabId
    await trackNavigation(tabId, "https://example.com/", 1000)
    await trackNavigation(tabId, "https://other.com/", 1060)
    const written = mockStorageSet.mock.calls[0][0].analyticsBuffer
    expect(written[written.length - 1].duration).toBe(60)
  })

  it("tracks duration independently per tab ID", async () => {
    const tabA = nextTabId
    const tabB = nextTabId + 100
    await trackNavigation(tabA, "https://a.com/", 1000)
    await trackNavigation(tabB, "https://b.com/", 1010)
    mockStorageGet.mockResolvedValue({ analyticsBuffer: [] })
    // tabA leaves a.com after 50 seconds; tabB has not moved
    await trackNavigation(tabA, "https://leave.com/", 1050)
    const written = mockStorageSet.mock.calls[0][0].analyticsBuffer
    const entry = written.find((e: { domain: string }) => e.domain === "a.com")
    expect(entry?.duration).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// No network calls on navigation events (acceptance criterion 3)
// ---------------------------------------------------------------------------

describe("trackNavigation – no immediate server network calls", () => {
  it("never calls fetch during a single navigation event", async () => {
    const tabId = nextTabId
    await trackNavigation(tabId, "https://example.com/", 1000)
    await trackNavigation(tabId, "https://another.com/", 1030)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("never calls fetch across many sequential navigation events", async () => {
    const tabId = nextTabId
    const sites = [
      "https://a.com/",
      "https://b.com/",
      "https://c.com/",
      "https://d.com/",
      "https://e.com/",
    ]
    for (let i = 0; i < sites.length; i++) {
      mockStorageGet.mockResolvedValue({ analyticsBuffer: [] })
      await trackNavigation(tabId, sites[i], i * 1000)
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
