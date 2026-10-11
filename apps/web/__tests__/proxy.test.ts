// @vitest-environment node
import { describe, it, expect, vi } from "vitest"
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"

vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }))

import { config } from "@/proxy"

function proxyRunsOn(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url })
}

// ---------------------------------------------------------------------------
// Extension-facing routes – the service worker's fetch carries no dashboard
// session cookie, so these must skip the proxy and authenticate via the sync
// token in the route handler. If the proxy runs, it 401s before the handler
// and the extension treats that as session_expired.
// ---------------------------------------------------------------------------

describe("proxy matcher – extension routes are not intercepted", () => {
  it.each([
    "/api/sync?token=abc",
    "/api/sync/revoke?token=abc",
    "/api/analytics?token=abc",
  ])("does not run on %s", (url) => {
    expect(proxyRunsOn(url)).toBe(false)
  })

  it("does not run on /api/sync/token, which checks the session itself", () => {
    expect(proxyRunsOn("/api/sync/token")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Session-protected routes – must stay behind the proxy
// ---------------------------------------------------------------------------

describe("proxy matcher – protected routes are intercepted", () => {
  it.each([
    "/dashboard",
    "/dashboard/analytics",
    "/api/usage",
    "/api/classify",
  ])("runs on %s", (url) => {
    expect(proxyRunsOn(url)).toBe(true)
  })

  it("does not run on Auth.js routes", () => {
    expect(proxyRunsOn("/api/auth/session")).toBe(false)
  })
})
