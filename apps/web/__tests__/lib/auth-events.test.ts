import { describe, it, expect, vi, beforeEach, Mock } from "vitest"

vi.mock("@/lib/sync-token", () => ({ revokeSyncTokensFor: vi.fn() }))

import { revokeSyncTokensFor } from "@/lib/sync-token"
import { handleSignOut } from "@/lib/auth-events"

const mockRevoke = revokeSyncTokensFor as unknown as Mock

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("handleSignOut — JWT-strategy sign-out (dashboard, any entry point)", () => {
  it("revokes sync tokens for the userId on the JWT's sub claim", async () => {
    await handleSignOut({ token: { sub: USER_ID } })
    expect(mockRevoke).toHaveBeenCalledWith(USER_ID)
  })

  it("does nothing when the JWT has no sub claim", async () => {
    await handleSignOut({ token: { sub: undefined } })
    expect(mockRevoke).not.toHaveBeenCalled()
  })

  it("does nothing when the token itself is null (e.g. an already-expired session)", async () => {
    await handleSignOut({ token: null })
    expect(mockRevoke).not.toHaveBeenCalled()
  })

  it("does nothing for the database-session-strategy shape (this app never uses it)", async () => {
    await handleSignOut({ session: {} })
    expect(mockRevoke).not.toHaveBeenCalled()
  })
})
