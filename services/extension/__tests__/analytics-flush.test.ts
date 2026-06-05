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
  it("does not call fetch when there is no userId in storage", async () => {
    mockStorageGet.mockResolvedValue({
      analyticsBuffer: [{ domain: "example.com", startedAt: 1000, duration: 60 }],
    })
    await flushAnalytics()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("does not call fetch when the buffer is an empty array", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-123", analyticsBuffer: [] })
    await flushAnalytics()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("does not call fetch when the analyticsBuffer key is absent from storage", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-123" })
    await flushAnalytics()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// flushAnalytics – HTTP request shape (acceptance criterion 1)
// ---------------------------------------------------------------------------

describe("flushAnalytics – POST request to /api/analytics", () => {
  const BUFFER = [
    { domain: "example.com", startedAt: 1000, duration: 60000 },
    { domain: "another.com", startedAt: 61000, duration: 30000 },
  ]

  beforeEach(() => {
    mockStorageGet.mockResolvedValue({ userId: "user-123", analyticsBuffer: BUFFER })
    mockFetch.mockResolvedValue({ ok: true })
  })

  it("sends a POST request", async () => {
    await flushAnalytics()
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe("POST")
  })

  it("targets a URL that includes /api/analytics", async () => {
    await flushAnalytics()
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain("/api/analytics")
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
})

// ---------------------------------------------------------------------------
// flushAnalytics – buffer management after flush
// ---------------------------------------------------------------------------

describe("flushAnalytics – buffer cleared only on a successful flush", () => {
  const BUFFER = [{ domain: "example.com", startedAt: 1000, duration: 60000 }]

  it("resets the buffer to an empty array in storage after a successful flush", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-123", analyticsBuffer: BUFFER })
    mockFetch.mockResolvedValue({ ok: true })
    await flushAnalytics()
    expect(mockStorageSet).toHaveBeenCalledWith({ analyticsBuffer: [] })
  })

  it("does not modify the buffer when the server responds with an error", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-123", analyticsBuffer: BUFFER })
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await flushAnalytics()
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it("does not modify the buffer when fetch throws a network error", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-123", analyticsBuffer: BUFFER })
    mockFetch.mockRejectedValue(new Error("network failure"))
    await flushAnalytics()
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})