import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"

vi.mock("../src/auth-handler", () => ({
  handleExternalMessage: vi.fn(),
  handleInternalMessage: vi.fn(),
  syncRules: vi.fn(),
}))
vi.mock("../src/analytics-flush", () => ({
  flushAnalytics: vi.fn(),
  registerFlushAlarm: vi.fn(),
  FLUSH_ALARM: "flush-analytics",
}))
vi.mock("../src/analytics-buffer", () => ({
  registerTabListeners: vi.fn(),
}))
vi.mock("../src/usage-monitor", () => ({
  registerUsageTickAlarm: vi.fn(),
  handleUsageTick: vi.fn(),
  USAGE_TICK_ALARM: "usage-tick",
}))

import { syncRules } from "../src/auth-handler"
import { registerFlushAlarm } from "../src/analytics-flush"
import { registerTabListeners } from "../src/analytics-buffer"
import { registerUsageTickAlarm } from "../src/usage-monitor"

type Listener = (...args: unknown[]) => void

function event() {
  const listeners: Listener[] = []
  return {
    listeners,
    addListener: vi.fn((fn: Listener) => listeners.push(fn)),
  }
}

const onInstalled = event()
const onStartup = event()
const mockAlarmsCreate = vi.fn()

vi.stubGlobal("chrome", {
  runtime: {
    onInstalled,
    onStartup,
    onMessage: event(),
    onMessageExternal: event(),
  },
  alarms: {
    create: mockAlarmsCreate,
    onAlarm: event(),
  },
})

function fire(evt: { listeners: Listener[] }) {
  for (const fn of evt.listeners) fn()
}

// src/background.js is a committed placeholder that Vite resolves ahead of
// background.ts, so the .ts extension is explicit. Held in a variable because
// tsc rejects literal .ts import paths.
const BACKGROUND_MODULE = "../src/background.ts"

let tabListenerCallsOnLoad = 0

beforeAll(async () => {
  await import(BACKGROUND_MODULE)
  tabListenerCallsOnLoad = vi.mocked(registerTabListeners).mock.calls.length
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tab listeners – MV3 service workers must attach listeners at the top level
// so they are present every time the worker wakes, not only after install
// ---------------------------------------------------------------------------

describe("background – top-level registration", () => {
  it("registers tab listeners when the service worker script loads", () => {
    expect(tabListenerCallsOnLoad).toBe(1)
  })

  it("does not register tab listeners again on install or startup", () => {
    fire(onInstalled)
    fire(onStartup)
    expect(registerTabListeners).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// onStartup – alarms are not guaranteed to survive a browser restart
// ---------------------------------------------------------------------------

describe("background – onStartup", () => {
  it("registers the sync-rules alarm every 5 minutes", () => {
    fire(onStartup)
    expect(mockAlarmsCreate).toHaveBeenCalledWith("sync-rules", { periodInMinutes: 5 })
  })

  it("registers the analytics flush alarm", () => {
    fire(onStartup)
    expect(registerFlushAlarm).toHaveBeenCalledTimes(1)
  })

  it("registers the usage-tick alarm", () => {
    fire(onStartup)
    expect(registerUsageTickAlarm).toHaveBeenCalledTimes(1)
  })

  it("runs syncRules once", () => {
    fire(onStartup)
    expect(syncRules).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// onInstalled – unchanged behaviour
// ---------------------------------------------------------------------------

describe("background – onInstalled", () => {
  it("registers all three alarms and runs syncRules", () => {
    fire(onInstalled)
    expect(mockAlarmsCreate).toHaveBeenCalledWith("sync-rules", { periodInMinutes: 5 })
    expect(registerFlushAlarm).toHaveBeenCalledTimes(1)
    expect(registerUsageTickAlarm).toHaveBeenCalledTimes(1)
    expect(syncRules).toHaveBeenCalledTimes(1)
  })
})
