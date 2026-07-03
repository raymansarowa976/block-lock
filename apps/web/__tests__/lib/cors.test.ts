import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { corsHeaders, handleCorsPreflight } from "@/lib/cors"

const EXTENSION_ID = "ldlmnamnojhcjjnfoodglmcnaedagljl"
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

beforeEach(() => {
  process.env.NEXT_PUBLIC_EXTENSION_ID = EXTENSION_ID
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_EXTENSION_ID
})

// ---------------------------------------------------------------------------
// corsHeaders
// ---------------------------------------------------------------------------

describe("corsHeaders", () => {
  it("returns headers echoing the extension origin when it matches NEXT_PUBLIC_EXTENSION_ID", () => {
    const headers = corsHeaders(EXTENSION_ORIGIN)
    expect(headers).not.toBeNull()
    expect(headers?.["Access-Control-Allow-Origin"]).toBe(EXTENSION_ORIGIN)
  })

  it("allows credentials so cookie-authenticated fetches from the extension succeed", () => {
    const headers = corsHeaders(EXTENSION_ORIGIN)
    expect(headers?.["Access-Control-Allow-Credentials"]).toBe("true")
  })

  it("does not use a wildcard origin (required alongside Allow-Credentials)", () => {
    const headers = corsHeaders(EXTENSION_ORIGIN)
    expect(headers?.["Access-Control-Allow-Origin"]).not.toBe("*")
  })

  it("returns null for an unrelated chrome-extension origin", () => {
    const headers = corsHeaders("chrome-extension://some-other-extension-id")
    expect(headers).toBeNull()
  })

  it("returns null for an arbitrary web origin", () => {
    const headers = corsHeaders("https://evil.com")
    expect(headers).toBeNull()
  })

  it("returns null when the origin header is absent", () => {
    const headers = corsHeaders(null)
    expect(headers).toBeNull()
  })

  it("returns null when NEXT_PUBLIC_EXTENSION_ID is not configured", () => {
    delete process.env.NEXT_PUBLIC_EXTENSION_ID
    const headers = corsHeaders(EXTENSION_ORIGIN)
    expect(headers).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// handleCorsPreflight (OPTIONS)
// ---------------------------------------------------------------------------

describe("handleCorsPreflight", () => {
  function preflightRequest(origin: string | null) {
    const headers = new Headers()
    if (origin) headers.set("origin", origin)
    return new Request("http://localhost/api/sync", { method: "OPTIONS", headers })
  }

  it("returns 204 with CORS headers for an allowed extension origin", () => {
    const res = handleCorsPreflight(preflightRequest(EXTENSION_ORIGIN))
    expect(res.status).toBe(204)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXTENSION_ORIGIN)
  })

  it("returns 403 for a disallowed origin", () => {
    const res = handleCorsPreflight(preflightRequest("https://evil.com"))
    expect(res.status).toBe(403)
  })

  it("returns 403 when no origin header is present", () => {
    const res = handleCorsPreflight(preflightRequest(null))
    expect(res.status).toBe(403)
  })
})
