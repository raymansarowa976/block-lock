import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/sync-token", () => ({ mintSyncToken: vi.fn() }))

import { auth } from "@/auth"
import { mintSyncToken } from "@/lib/sync-token"
import { GET } from "@/app/api/sync/token/route"

const mockAuth = auth as unknown as Mock
const mockMint = mintSyncToken as unknown as Mock

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"
const AUTHED_SESSION = { user: { id: USER_ID }, expires: "" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/sync/token", () => {
  it("returns 401 when there is no authenticated dashboard session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("does not mint a token when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    await GET()
    expect(mockMint).not.toHaveBeenCalled()
  })

  it("mints a token scoped to the session's user id", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockMint.mockReturnValue({ token: "abc.def", expiresAt: 123 })
    await GET()
    expect(mockMint).toHaveBeenCalledWith(USER_ID)
  })

  it("returns 200 with the minted token and expiry", async () => {
    mockAuth.mockResolvedValue(AUTHED_SESSION)
    mockMint.mockReturnValue({ token: "abc.def", expiresAt: 123 })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ token: "abc.def", expiresAt: 123 })
  })
})
