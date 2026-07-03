import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// ---------------------------------------------------------------------------
// config.ts is the single wrapper around NEXT_PUBLIC_APP_URL. It must never
// resolve to a loopback address unless that address was explicitly supplied
// via the environment — a production build with no override must always
// point at the deployed blocklock.app domain.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("config – NEXT_PUBLIC_APP_URL resolution", () => {
  it("falls back to the production blocklock.app domain when NEXT_PUBLIC_APP_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined)
    const { APP_URL } = await import("../src/config")
    expect(APP_URL).toBe("https://blocklock.app")
  })

  it("never falls back to a loopback address", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined)
    const { APP_URL } = await import("../src/config")
    expect(APP_URL).not.toMatch(/localhost|127\.0\.0\.1/)
  })

  it("uses NEXT_PUBLIC_APP_URL when explicitly provided (e.g. local development)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    const { APP_URL } = await import("../src/config")
    expect(APP_URL).toBe("http://localhost:3000")
  })
})

describe("config – derived API_BASE", () => {
  it("derives API_BASE from APP_URL with an /api suffix", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://blocklock.app")
    const { API_BASE } = await import("../src/config")
    expect(API_BASE).toBe("https://blocklock.app/api")
  })

  it("derives API_BASE from a locally-overridden APP_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    const { API_BASE } = await import("../src/config")
    expect(API_BASE).toBe("http://localhost:3000/api")
  })
})

describe("config – derived DASHBOARD_URL", () => {
  it("derives DASHBOARD_URL from APP_URL with a /login suffix", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://blocklock.app")
    const { DASHBOARD_URL } = await import("../src/config")
    expect(DASHBOARD_URL).toBe("https://blocklock.app/login")
  })
})
