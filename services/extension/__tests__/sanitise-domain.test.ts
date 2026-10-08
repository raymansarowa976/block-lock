import { describe, it, expect } from "vitest"
import { DomainSchema } from "@block-lock/shared-types"
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

describe("sanitiseDomain – canonical form matches the shared DomainSchema", () => {
  it("lowercases the host", () => {
    expect(sanitiseDomain("https://Example.COM/path")).toBe("example.com")
  })

  it.each(["example.com", "Example.COM", "news.bbc.co.uk", "bücher.de", "пример.рф", "xn--bcher-kva.de"])(
    "produces exactly what the server stores for %s",
    (domain) => {
      expect(sanitiseDomain(domain)).toBe(DomainSchema.parse(domain))
    },
  )

  it.each(["not a domain", "localhost", "192.168.1.1", "user@example.com", "exam!ple.com"])(
    "rejects %s just as the server does",
    (domain) => {
      expect(sanitiseDomain(domain)).toBeNull()
      expect(DomainSchema.safeParse(domain).success).toBe(false)
    },
  )

  it("is idempotent, so re-sanitising a server-stored domain is a no-op", () => {
    const stored = DomainSchema.parse("Bücher.de")
    expect(sanitiseDomain(stored)).toBe(stored)
  })
})

describe("sanitiseDomain – multi-part public suffixes (co.uk style)", () => {
  it.each(["bbc.co.uk", "example.com.au", "foo.bar.co.jp"])("keeps every label of %s", (domain) => {
    expect(sanitiseDomain(`https://${domain}/path`)).toBe(domain)
  })
})

describe("sanitiseDomain – internationalised domain names", () => {
  it("converts a Unicode host inside a URL to punycode", () => {
    expect(sanitiseDomain("https://bücher.de/path?q=1")).toBe("xn--bcher-kva.de")
  })

  it("converts a Unicode TLD to punycode", () => {
    expect(sanitiseDomain("пример.рф")).toBe("xn--e1afmkfd.xn--p1ai")
  })

  it("matches the hostname Chrome reports for the same IDN tab URL", () => {
    expect(sanitiseDomain("bücher.de")).toBe(new URL("https://bücher.de/").hostname)
  })
})

describe("sanitiseDomain – IP-literal hosts return null", () => {
  it.each([
    "http://127.0.0.1:8080/",
    "0x7f.0.0.1",
    "2130706433",
    "[::1]",
    "http://[2001:db8::1]/path",
  ])("rejects %s", (input) => {
    expect(sanitiseDomain(input)).toBeNull()
  })
})
