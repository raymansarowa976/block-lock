import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    usageLog: { createMany: vi.fn() },
  },
}))

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { POST } from "@/app/api/analytics/route"

const mockAuth = auth as unknown as Mock
const mockCreateMany = (
  prisma as unknown as { usageLog: { createMany: Mock } }
).usageLog.createMany

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

const VALID_ENTRIES = [
  { domain: "example.com", startedAt: 1000, duration: 60000 },
  { domain: "another.com", startedAt: 61000, duration: 30000 },
]

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateMany.mockResolvedValue({ count: VALID_ENTRIES.length })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – authentication
// ---------------------------------------------------------------------------

describe("POST /api/analytics – authentication", () => {
  it("returns 401 when the request has no session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }))
    expect(res.status).toBe(401)
  })

  it("does not touch the database for unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null)
    await POST(jsonRequest({ entries: VALID_ENTRIES }))
    expect(mockCreateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – Zod schema validation (acceptance criterion 2)
// ---------------------------------------------------------------------------

describe("POST /api/analytics – Zod schema validation", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
  })

  it("returns 400 for an entry with an invalid domain", async () => {
    const res = await POST(
      jsonRequest({ entries: [{ domain: "not a domain!!!", startedAt: 1000, duration: 60 }] }),
    )
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for an entry with a negative startedAt", async () => {
    const res = await POST(
      jsonRequest({ entries: [{ domain: "example.com", startedAt: -1, duration: 60 }] }),
    )
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for an entry with a negative duration", async () => {
    const res = await POST(
      jsonRequest({ entries: [{ domain: "example.com", startedAt: 1000, duration: -1 }] }),
    )
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 when entries is an empty array", async () => {
    const res = await POST(jsonRequest({ entries: [] }))
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 when the entries key is missing from the body", async () => {
    const res = await POST(jsonRequest({ domain: "example.com" }))
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for a non-integer startedAt", async () => {
    const res = await POST(
      jsonRequest({ entries: [{ domain: "example.com", startedAt: 1.5, duration: 60 }] }),
    )
    expect(res.status).toBe(400)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("includes validation error details in the 400 response body", async () => {
    const res = await POST(
      jsonRequest({ entries: [{ domain: "bad domain!!!", startedAt: 1000, duration: 60 }] }),
    )
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – Prisma createMany batch operation (acceptance criterion 3)
// ---------------------------------------------------------------------------

describe("POST /api/analytics – createMany batch write", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
  })

  it("calls usageLog.createMany exactly once for a valid batch", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }))
    expect(mockCreateMany).toHaveBeenCalledOnce()
  })

  it("passes all entries as a single data array to createMany", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }))
    const { data } = mockCreateMany.mock.calls[0][0]
    expect(data).toHaveLength(VALID_ENTRIES.length)
  })

  it("injects the session userId into every row", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }))
    const { data } = mockCreateMany.mock.calls[0][0]
    expect(data.every((row: { userId: string }) => row.userId === USER_ID)).toBe(true)
  })

  it("maps the domain field from each entry to the corresponding row", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }))
    const { data } = mockCreateMany.mock.calls[0][0]
    const domains = data.map((r: { domain: string }) => r.domain)
    expect(domains).toEqual(["example.com", "another.com"])
  })

  it("maps the duration field from each entry to the corresponding row", async () => {
    await POST(jsonRequest({ entries: VALID_ENTRIES }))
    const { data } = mockCreateMany.mock.calls[0][0]
    expect(data[0].duration).toBe(VALID_ENTRIES[0].duration)
    expect(data[1].duration).toBe(VALID_ENTRIES[1].duration)
  })

  it("does not call createMany more than once regardless of batch size", async () => {
    const bigBatch = Array.from({ length: 20 }, (_, i) => ({
      domain: `site${i}.com`,
      startedAt: i * 1000,
      duration: 5000,
    }))
    await POST(jsonRequest({ entries: bigBatch }))
    expect(mockCreateMany).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// POST /api/analytics – success response
// ---------------------------------------------------------------------------

describe("POST /api/analytics – success response", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
  })

  it("returns 201 on a valid batch", async () => {
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }))
    expect(res.status).toBe(201)
  })

  it("returns the count of inserted records in the response body", async () => {
    const res = await POST(jsonRequest({ entries: VALID_ENTRIES }))
    const body = await res.json()
    expect(body.count).toBe(VALID_ENTRIES.length)
  })
})
