import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  registerTabListeners,
  trackNavigation,
  trackActivation,
  trackTabClosed,
  type UsageEntry,
} from "../src/analytics-buffer"

// Both storage areas are backed by plain objects so state written by one call
// is visible to the next, the same as in Chrome.
let localStore: Record<string, unknown>
let sessionStore: Record<string, unknown>

function fakeArea(getStore: () => Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key]
      const store = getStore()
      return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(getStore(), items)
    }),
  }
}

const localArea = fakeArea(() => localStore)
const sessionArea = fakeArea(() => sessionStore)
const mockTabsGet = vi.fn()
const mockTabsOnUpdated = { addListener: vi.fn() }
const mockTabsOnActivated = { addListener: vi.fn() }
const mockTabsOnRemoved = { addListener: vi.fn() }
const mockFetch = vi.fn()

vi.stubGlobal("chrome", {
  storage: {
    local: localArea,
    session: sessionArea,
  },
  tabs: {
    get: mockTabsGet,
    onUpdated: mockTabsOnUpdated,
    onActivated: mockTabsOnActivated,
    onRemoved: mockTabsOnRemoved,
  },
})
vi.stubGlobal("fetch", mockFetch)

beforeEach(() => {
  localStore = {}
  sessionStore = {}
  localArea.get.mockClear()
  localArea.set.mockClear()
  sessionArea.get.mockClear()
  sessionArea.set.mockClear()
  mockTabsGet.mockReset()
  mockTabsOnUpdated.addListener.mockReset()
  mockTabsOnActivated.addListener.mockReset()
  mockTabsOnRemoved.addListener.mockReset()
  mockFetch.mockReset()
})

function buffer(): UsageEntry[] {
  return (localStore.analyticsBuffer as UsageEntry[] | undefined) ?? []
}

// ---------------------------------------------------------------------------
// registerTabListeners
// ---------------------------------------------------------------------------

describe("registerTabListeners – event listener registration", () => {
  it("attaches listeners to tabs.onUpdated, tabs.onActivated and tabs.onRemoved", () => {
    registerTabListeners()
    expect(mockTabsOnUpdated.addListener).toHaveBeenCalledTimes(1)
    expect(mockTabsOnActivated.addListener).toHaveBeenCalledTimes(1)
    expect(mockTabsOnRemoved.addListener).toHaveBeenCalledTimes(1)
  })
})

describe("registerTabListeners – onUpdated callback", () => {
  it("records the previous visit when the active tab finishes loading a new page", async () => {
    registerTabListeners()
    const listener = mockTabsOnUpdated.addListener.mock.calls[0][0]
    await trackNavigation(1, "https://prime.com/", 0)
    await listener(1, { status: "complete", url: "https://example.com/" }, { active: true })
    expect(buffer()).toHaveLength(1)
    expect(buffer()[0].domain).toBe("prime.com")
  })

  it("ignores page loads in background tabs", async () => {
    registerTabListeners()
    const listener = mockTabsOnUpdated.addListener.mock.calls[0][0]
    await trackNavigation(1, "https://prime.com/", 0)
    await listener(2, { status: "complete", url: "https://example.com/" }, { active: false })
    expect(buffer()).toHaveLength(0)
    expect(sessionStore.activeVisit).toMatchObject({ tabId: 1, domain: "prime.com" })
  })

  it("ignores onUpdated events that carry no URL in changeInfo", async () => {
    registerTabListeners()
    const listener = mockTabsOnUpdated.addListener.mock.calls[0][0]
    await listener(1, { status: "complete" }, { active: true })
    expect(sessionArea.set).not.toHaveBeenCalled()
  })

  it("ignores onUpdated events whose status is not 'complete'", async () => {
    registerTabListeners()
    const listener = mockTabsOnUpdated.addListener.mock.calls[0][0]
    await listener(1, { status: "loading", url: "https://example.com/" }, { active: true })
    expect(sessionArea.set).not.toHaveBeenCalled()
  })
})

describe("registerTabListeners – onActivated callback", () => {
  it("records the previous tab's visit when the user switches tabs", async () => {
    registerTabListeners()
    const listener = mockTabsOnActivated.addListener.mock.calls[0][0]
    mockTabsGet.mockResolvedValue({ id: 2, url: "https://b.com/" })
    await trackNavigation(1, "https://a.com/", 0)
    await listener({ tabId: 2, windowId: 1 })
    expect(mockTabsGet).toHaveBeenCalledWith(2)
    expect(buffer()[0].domain).toBe("a.com")
  })
})

describe("registerTabListeners – onRemoved callback", () => {
  it("records the visit when the active tab is closed", async () => {
    registerTabListeners()
    const listener = mockTabsOnRemoved.addListener.mock.calls[0][0]
    await trackNavigation(1, "https://a.com/", 0)
    await listener(1, { windowId: 1, isWindowClosing: false })
    expect(buffer()[0].domain).toBe("a.com")
  })
})

// ---------------------------------------------------------------------------
// Persistence across service worker restarts
// ---------------------------------------------------------------------------

describe("open visit state – chrome.storage.session", () => {
  it("stores the open visit in chrome.storage.session, not in module memory", async () => {
    await trackNavigation(1, "https://example.com/", 1000)
    expect(sessionStore.activeVisit).toEqual({ tabId: 1, domain: "example.com", startedAt: 1000 })
  })

  it("finalises a visit that was opened before the service worker restarted", async () => {
    // A fresh worker has nothing in memory; only session storage survives.
    sessionStore.activeVisit = { tabId: 1, domain: "example.com", startedAt: 1000 }
    await trackNavigation(1, "https://other.com/", 61_000)
    expect(buffer()).toEqual([{ domain: "example.com", startedAt: 1000, duration: 60_000 }])
  })

  it("does not keep open visits in chrome.storage.local", async () => {
    await trackNavigation(1, "https://example.com/", 1000)
    expect(localStore.activeVisit).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// trackNavigation
// ---------------------------------------------------------------------------

describe("trackNavigation – first navigation", () => {
  it("does not write to the buffer when no visit is open", async () => {
    await trackNavigation(1, "https://example.com/", 1000)
    expect(localArea.set).not.toHaveBeenCalled()
  })
})

describe("trackNavigation – buffer accumulation", () => {
  it("stores entries under the analyticsBuffer key", async () => {
    await trackNavigation(1, "https://example.com/", 1000)
    await trackNavigation(1, "https://another.com/", 1030)
    expect(localArea.set).toHaveBeenCalledWith(
      expect.objectContaining({ analyticsBuffer: expect.any(Array) }),
    )
  })

  it("appends to the existing buffer rather than replacing it", async () => {
    localStore.analyticsBuffer = [{ domain: "old.com", startedAt: 0, duration: 10 }]
    await trackNavigation(1, "https://a.com/", 1000)
    await trackNavigation(1, "https://b.com/", 1030)
    expect(buffer()).toHaveLength(2)
    expect(buffer()[0].domain).toBe("old.com")
  })

  it("stores the hostname only (not path or query string)", async () => {
    await trackNavigation(1, "https://example.com/path?q=1#frag", 1000)
    await trackNavigation(1, "https://other.com/", 1060)
    expect(buffer()[0].domain).toBe("example.com")
  })

  it("sets startedAt to arrival time and duration to time spent", async () => {
    await trackNavigation(1, "https://example.com/", 1000)
    await trackNavigation(1, "https://other.com/", 1060)
    expect(buffer()[0]).toEqual({ domain: "example.com", startedAt: 1000, duration: 60 })
  })

  it("starts timing the new page from the navigation timestamp", async () => {
    await trackNavigation(1, "https://a.com/", 1000)
    await trackNavigation(1, "https://b.com/", 1030)
    await trackNavigation(1, "https://c.com/", 1100)
    expect(buffer()[1]).toEqual({ domain: "b.com", startedAt: 1030, duration: 70 })
  })

  it("closes the open visit when the tab navigates to an untrackable URL", async () => {
    await trackNavigation(1, "https://legit.com/", 1000)
    await trackNavigation(1, "not-a-url", 1030)
    expect(buffer()).toEqual([{ domain: "legit.com", startedAt: 1000, duration: 30 }])
    expect(sessionStore.activeVisit).toBeNull()
  })

  it("serialises overlapping events so no entry is lost", async () => {
    await Promise.all([
      trackNavigation(1, "https://a.com/", 1000),
      trackNavigation(1, "https://b.com/", 1010),
      trackNavigation(1, "https://c.com/", 1020),
    ])
    expect(buffer().map((e) => e.domain)).toEqual(["a.com", "b.com"])
  })
})

// ---------------------------------------------------------------------------
// trackActivation – tab switches
// ---------------------------------------------------------------------------

describe("trackActivation – switching tabs", () => {
  it("records the time spent on the previously active tab", async () => {
    mockTabsGet.mockResolvedValue({ id: 2, url: "https://b.com/" })
    await trackNavigation(1, "https://a.com/", 1000)
    await trackActivation(2, 1050)
    expect(buffer()).toEqual([{ domain: "a.com", startedAt: 1000, duration: 50 }])
  })

  it("opens a visit for the newly activated tab", async () => {
    mockTabsGet.mockResolvedValue({ id: 2, url: "https://b.com/page" })
    await trackActivation(2, 1050)
    expect(sessionStore.activeVisit).toEqual({ tabId: 2, domain: "b.com", startedAt: 1050 })
  })

  it("does not count time in a background tab once the user switches away", async () => {
    mockTabsGet.mockResolvedValueOnce({ id: 2, url: "https://b.com/" })
    mockTabsGet.mockResolvedValueOnce({ id: 1, url: "https://a.com/" })
    await trackNavigation(1, "https://a.com/", 1000)
    await trackActivation(2, 1010)
    await trackActivation(1, 5000)
    await trackNavigation(1, "https://c.com/", 5020)
    const aTime = buffer()
      .filter((e) => e.domain === "a.com")
      .reduce((sum, e) => sum + e.duration, 0)
    expect(aTime).toBe(30)
  })

  it("leaves no open visit when the activated tab has no URL yet", async () => {
    mockTabsGet.mockResolvedValue({ id: 2 })
    await trackNavigation(1, "https://a.com/", 1000)
    await trackActivation(2, 1050)
    expect(buffer()).toHaveLength(1)
    expect(sessionStore.activeVisit).toBeNull()
  })

  it("still records the previous visit if the activated tab cannot be read", async () => {
    mockTabsGet.mockRejectedValue(new Error("No tab with id: 2"))
    await trackNavigation(1, "https://a.com/", 1000)
    await trackActivation(2, 1050)
    expect(buffer()).toHaveLength(1)
    expect(sessionStore.activeVisit).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// trackTabClosed – tab closes
// ---------------------------------------------------------------------------

describe("trackTabClosed – closing tabs", () => {
  it("records the visit when its tab is closed", async () => {
    await trackNavigation(1, "https://a.com/", 1000)
    await trackTabClosed(1, 1200)
    expect(buffer()).toEqual([{ domain: "a.com", startedAt: 1000, duration: 200 }])
    expect(sessionStore.activeVisit).toBeNull()
  })

  it("ignores closes of tabs other than the active one", async () => {
    await trackNavigation(1, "https://a.com/", 1000)
    await trackTabClosed(2, 1200)
    expect(buffer()).toHaveLength(0)
    expect(sessionStore.activeVisit).toMatchObject({ tabId: 1 })
  })
})

// ---------------------------------------------------------------------------
// No network calls
// ---------------------------------------------------------------------------

describe("tab tracking – no immediate server network calls", () => {
  it("never calls fetch across navigation, activation and close events", async () => {
    mockTabsGet.mockResolvedValue({ id: 2, url: "https://b.com/" })
    await trackNavigation(1, "https://a.com/", 1000)
    await trackActivation(2, 1030)
    await trackTabClosed(2, 1060)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
