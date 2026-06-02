import { describe, it, expect } from "vitest"
import { sanitiseDomain } from "../src/sanitise-domain"

describe("sanitiseDomain – valid inputs pass through clean", () => {
  it("returns a plain domain unchanged", () => {
    expect(sanitiseDomain("example.com")).toBe("example.com")
  })

  it("returns a subdomain unchanged", () => {
    expect(sanitiseDomain("news.bbc.co.uk")).toBe("news.bbc.co.uk")
  })

  it("preserves www prefix", () => {
    expect(sanitiseDomain("www.example.com")).toBe("www.example.com")
  })
})

describe("sanitiseDomain – protocol stripping", () => {
  it("strips https:// prefix", () => {
    expect(sanitiseDomain("https://example.com")).toBe("example.com")
  })

  it("strips http:// prefix", () => {
    expect(sanitiseDomain("http://example.com")).toBe("example.com")
  })

  it("strips protocol regardless of case", () => {
    expect(sanitiseDomain("HTTPS://example.com")).toBe("example.com")
  })
})

describe("sanitiseDomain – path / query / fragment stripping", () => {
  it("strips a path", () => {
    expect(sanitiseDomain("example.com/some/path")).toBe("example.com")
  })

  it("strips a query string", () => {
    expect(sanitiseDomain("example.com?q=1")).toBe("example.com")
  })

  it("strips a fragment", () => {
    expect(sanitiseDomain("example.com#section")).toBe("example.com")
  })

  it("strips protocol and path together", () => {
    expect(sanitiseDomain("https://example.com/path?q=1#top")).toBe("example.com")
  })
})

describe("sanitiseDomain – port stripping", () => {
  it("strips an explicit port number", () => {
    expect(sanitiseDomain("example.com:443")).toBe("example.com")
  })

  it("strips port when protocol is also present", () => {
    expect(sanitiseDomain("https://example.com:8080/path")).toBe("example.com")
  })
})

describe("sanitiseDomain – dot normalisation", () => {
  it("strips a leading dot", () => {
    expect(sanitiseDomain(".example.com")).toBe("example.com")
  })

  it("strips multiple leading dots", () => {
    expect(sanitiseDomain("..example.com")).toBe("example.com")
  })

  it("strips a trailing dot (FQDN notation)", () => {
    expect(sanitiseDomain("example.com.")).toBe("example.com")
  })
})

describe("sanitiseDomain – whitespace", () => {
  it("trims leading and trailing whitespace", () => {
    expect(sanitiseDomain("  example.com  ")).toBe("example.com")
  })
})

describe("sanitiseDomain – invalid inputs return null", () => {
  it("returns null for an empty string", () => {
    expect(sanitiseDomain("")).toBeNull()
  })

  it("returns null for a bare word with no TLD", () => {
    expect(sanitiseDomain("localhost")).toBeNull()
  })

  it("returns null for a string containing spaces", () => {
    expect(sanitiseDomain("not a domain")).toBeNull()
  })

  it("returns null for an IPv4 address", () => {
    expect(sanitiseDomain("192.168.1.1")).toBeNull()
  })

  it("returns null for a value that is only a protocol", () => {
    expect(sanitiseDomain("https://")).toBeNull()
  })

  it("returns null for a single dot", () => {
    expect(sanitiseDomain(".")).toBeNull()
  })
})