import { describe, it, expect, vi, beforeEach } from "vitest"
import { flushAnalytics, registerFlushAlarm, FLUSH_ALARM } from "../src/analytics-flush"

const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()
const mockAlarmsCreate = vi.fn()
const mockFetch = vi.fn()

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
  alarms: {
    create: mockAlarmsCreate,
  },
})
vi.stubGlobal("fetch", mockFetch)

const BUFFER = [
  { domain: "example.com", startedAt: 1000, duration: 60000 },
  { domain: "another.com", startedAt: 61000, duration: 30000 },
]

beforeEach(() => {
  mockStorageGet.mockReset().mockResolvedValue({})
  mockStorageSet.mockReset().mockResolvedValue(undefined)
  mockAlarmsCreate.mockReset().mockResolvedValue(undefined)
  mockFetch.mockReset()
})

// ---------------------------------------------------------------------------
// registerFlushAlarm – 5-minute cron setup (acceptance criterion 1)
// ---------------------------------------------------------------------------

describe("registerFlushAlarm – alarm creation", () => {
  it("creates a Chrome alarm using the FLUSH_ALARM name constant", () => {
    registerFlushAlarm()
    expect(mockAlarmsCreate).toHaveBeenCalledWith(FLUSH_ALARM, expect.any(Object))
  })

  it("sets the alarm period to exactly 5 minutes", () => {
    registerFlushAlarm()
    const [, opts] = mockAlarmsCreate.mock.calls[0]
    expect(opts.periodInMinutes).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// flushAnalytics – guard conditions (skip when nothing to do)
// ---------------------------------------------------------------------------

describe("flushAnalytics – skips when preconditions are not met", () => {
  it("does not call fetch when there is no token in storage", async () => {
    mockStorageGet.mockResolvedValue({ analyticsBuffer: BUFFER })
    await flushAnalytics()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("does not call fetch when the buffer is an empty array", async () => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() + 60_000,
      analyticsBuffer: [],
    })
    await flushAnalytics()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("does not call fetch when the analyticsBuffer key is absent from storage", async () => {
    mockStorageGet.mockResolvedValue({ token: "signed.tok", tokenExpiresAt: Date.now() + 60_000 })
    await flushAnalytics()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// flushAnalytics – locally expired token (same credential scheme as
// syncRules in auth-handler.ts: catch an expired token before spending a
// round-trip on a guaranteed 401)
// ---------------------------------------------------------------------------

describe("flushAnalytics – locally expired token", () => {
  it("does not call fetch once the stored token's expiry has passed", async () => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() - 1,
      analyticsBuffer: BUFFER,
    })
    await flushAnalytics()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("clears the credential and sets authError when the token is locally expired", async () => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() - 1,
      analyticsBuffer: BUFFER,
    })
    await flushAnalytics()
    expect(mockStorageSet).toHaveBeenCalledWith({
      authError: "session_expired",
      userId: null,
      token: null,
      tokenExpiresAt: null,
    })
  })
})

// ---------------------------------------------------------------------------
// flushAnalytics – HTTP request shape (acceptance criterion: /api/analytics
// now uses the same signed-token scheme as /api/sync — the token rides along
// as a query param since a chrome-extension:// service-worker fetch is
// cross-site and never carries the dashboard's session cookie)
// ---------------------------------------------------------------------------

describe("flushAnalytics – POST request to /api/analytics", () => {
  beforeEach(() => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() + 60_000,
      analyticsBuffer: BUFFER,
    })
    mockFetch.mockResolvedValue({ ok: true, status: 201 })
  })

  it("sends a POST request", async () => {
    await flushAnalytics()
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe("POST")
  })

  it("targets a URL that includes /api/analytics with the signed token as a query param", async () => {
    await flushAnalytics()
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain("/api/analytics?token=signed.tok")
  })

  it("sets Content-Type to application/json", async () => {
    await flushAnalytics()
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers["Content-Type"]).toBe("application/json")
  })

  it("includes all buffered entries in the request body", async () => {
    await flushAnalytics()
    const [, opts] = mockFetch.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.entries).toHaveLength(2)
  })

  it("preserves domain, startedAt and duration for each entry", async () => {
    await flushAnalytics()
    const [, opts] = mockFetch.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.entries[0]).toMatchObject({ domain: "example.com", startedAt: 1000, duration: 60000 })
    expect(body.entries[1]).toMatchObject({ domain: "another.com", startedAt: 61000, duration: 30000 })
  })

  it("does not leak the token into the request body", async () => {
    await flushAnalytics()
    const [, opts] = mockFetch.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body).not.toHaveProperty("token")
  })
})

// ---------------------------------------------------------------------------
// flushAnalytics – buffer management after flush
// ---------------------------------------------------------------------------

describe("flushAnalytics – buffer cleared only on a successful flush", () => {
  beforeEach(() => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() + 60_000,
      analyticsBuffer: BUFFER,
    })
  })

  it("resets the buffer to an empty array in storage after a successful flush", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 })
    await flushAnalytics()
    expect(mockStorageSet).toHaveBeenCalledWith({ analyticsBuffer: [] })
  })

  it("does not modify the buffer when the server responds with a non-auth error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await flushAnalytics()
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("does not modify the buffer when fetch throws a network error", async () => {
    mockFetch.mockRejectedValue(new Error("network failure"))
    await flushAnalytics()
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// flushAnalytics – server-side auth rejection (acceptance criterion: same
// token scheme as /api/sync, including 401/403 handling)
// ---------------------------------------------------------------------------

describe("flushAnalytics – server rejects the token", () => {
  beforeEach(() => {
    mockStorageGet.mockResolvedValue({
      token: "signed.tok",
      tokenExpiresAt: Date.now() + 60_000,
      analyticsBuffer: BUFFER,
    })
  })

  it("clears the credential and sets authError on a 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    await flushAnalytics()
    expect(mockStorageSet).toHaveBeenCalledWith({
      authError: "session_expired",
      userId: null,
      token: null,
      tokenExpiresAt: null,
    })
  })

  it("clears the credential and sets authError on a 403", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
    await flushAnalytics()
    expect(mockStorageSet).toHaveBeenCalledWith({
      authError: "session_expired",
      userId: null,
      token: null,
      tokenExpiresAt: null,
    })
  })

  it("leaves the buffer intact when the token is rejected", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    await flushAnalytics()
    expect(mockStorageSet).not.toHaveBeenCalledWith({ analyticsBuffer: [] })
  })
})
