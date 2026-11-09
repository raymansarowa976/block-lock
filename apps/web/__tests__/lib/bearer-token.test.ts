import { describe, it, expect } from "vitest"
import { bearerToken } from "@/lib/bearer-token"

function requestWith(authorization?: string, url = "http://localhost/api/sync") {
  const headers = new Headers()
  if (authorization !== undefined) headers.set("authorization", authorization)
  return new Request(url, { headers })
}

describe("bearerToken", () => {
  it("returns the token from an Authorization: Bearer header", () => {
    expect(bearerToken(requestWith("Bearer abc.def"))).toBe("abc.def")
  })

  it("accepts the scheme in any case", () => {
    expect(bearerToken(requestWith("bearer abc.def"))).toBe("abc.def")
  })

  it("returns null when the header is absent", () => {
    expect(bearerToken(requestWith())).toBeNull()
  })

  it("returns null for a non-Bearer scheme", () => {
    expect(bearerToken(requestWith("Basic dXNlcjpwYXNz"))).toBeNull()
  })

  it("returns null when the scheme has no token", () => {
    expect(bearerToken(requestWith("Bearer "))).toBeNull()
  })

  it("does not read a token from the query string", () => {
    expect(bearerToken(requestWith(undefined, "http://localhost/api/sync?token=abc"))).toBeNull()
  })
})
