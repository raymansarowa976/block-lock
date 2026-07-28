import { render, screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ActiveRulesList } from "@/components/active-rules-list"

vi.mock("@/lib/actions/time-limits", () => ({
  deleteTimeLimit: vi.fn(),
  updateTimeLimit: vi.fn(),
}))

vi.mock("@/components/extension-bridge", () => ({
  notifyExtensionRulesUpdated: vi.fn(),
}))

import { deleteTimeLimit, updateTimeLimit } from "@/lib/actions/time-limits"
import { notifyExtensionRulesUpdated } from "@/components/extension-bridge"
const mockDelete = deleteTimeLimit as ReturnType<typeof vi.fn>
const mockUpdate = updateTimeLimit as ReturnType<typeof vi.fn>
const mockNotify = notifyExtensionRulesUpdated as ReturnType<typeof vi.fn>

function makeRule(overrides = {}) {
  return {
    id: "clh3q5g0o0001qmij2z3m4n5k",
    domain: "example.com",
    dailyLimit: 30,
    isActive: true,
    schedules: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDelete.mockResolvedValue({ success: true })
  mockUpdate.mockResolvedValue({ success: true })
})

describe("ActiveRulesList — status markers", () => {
  it("renders a Blocked status badge for absolute block rules", () => {
    const rules = [makeRule({ dailyLimit: null })]
    render(<ActiveRulesList timeLimits={rules} />)
    const badge = screen.getByTestId("status-blocked")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("Blocked")
  })

  it("renders a time-allowance pill for metered rules", () => {
    const rules = [makeRule({ dailyLimit: 30 })]
    render(<ActiveRulesList timeLimits={rules} />)
    const pill = screen.getByTestId("status-metered")
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveTextContent("30 min/day")
  })

  it("renders both badge types when the list has mixed rules", () => {
    const rules = [
      makeRule({ id: "rule-1", domain: "twitter.com", dailyLimit: null }),
      makeRule({ id: "rule-2", domain: "youtube.com", dailyLimit: 60 }),
    ]
    render(<ActiveRulesList timeLimits={rules} />)
    expect(screen.getByTestId("status-blocked")).toBeInTheDocument()
    expect(screen.getByTestId("status-metered")).toBeInTheDocument()
  })

  it("applies visually distinct styling to each status type", () => {
    const rules = [
      makeRule({ id: "rule-1", domain: "twitter.com", dailyLimit: null }),
      makeRule({ id: "rule-2", domain: "youtube.com", dailyLimit: 60 }),
    ]
    render(<ActiveRulesList timeLimits={rules} />)
    const blocked = screen.getByTestId("status-blocked")
    const metered = screen.getByTestId("status-metered")
    expect(blocked.className).not.toBe(metered.className)
  })

  it("shows the correct minute value in the metered pill", () => {
    const rules = [makeRule({ dailyLimit: 120 })]
    render(<ActiveRulesList timeLimits={rules} />)
    expect(screen.getByTestId("status-metered")).toHaveTextContent("120 min/day")
  })
})

describe("ActiveRulesList — optimistic updates", () => {
  it("does not log a React error when deleting a rule", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const rules = [makeRule()]
    render(<ActiveRulesList timeLimits={rules} />)
    await userEvent.click(screen.getByRole("button", { name: /delete example.com/i }))
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
    })
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("does not log a React error when toggling a rule", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const rules = [makeRule()]
    render(<ActiveRulesList timeLimits={rules} />)
    await userEvent.click(screen.getByRole("button", { name: /pause rule/i }))
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
    })
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("disables the delete button once a delete is in flight, preventing a duplicate request", async () => {
    // Regression test: double-clicking delete used to fire two concurrent
    // deleteTimeLimit calls for the same rule. The row disappears from view
    // (and its button is disabled) as soon as the first click is handled, so
    // a second click can't reach handleDelete at all.
    let resolveDelete!: (v: { success: true }) => void
    mockDelete.mockReturnValue(new Promise((resolve) => { resolveDelete = resolve }))
    const rules = [makeRule()]
    render(<ActiveRulesList timeLimits={rules} />)

    const deleteButton = screen.getByRole("button", { name: /delete example.com/i })
    await userEvent.click(deleteButton)

    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /delete example.com/i })).not.toBeInTheDocument()

    resolveDelete({ success: true })
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalled()
    })
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })

  it("does not show an error when the server reports a duplicate delete as an already-applied success", async () => {
    // Even if a duplicate request did reach the server, lib/actions/time-limits.ts
    // now treats "record already deleted" as a no-op success (see
    // __tests__/actions/time-limits.test.ts), so the client should never see
    // an error for this case.
    mockDelete.mockResolvedValue({ success: true })
    const rules = [makeRule()]
    render(<ActiveRulesList timeLimits={rules} />)
    await userEvent.click(screen.getByRole("button", { name: /delete example.com/i }))
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
    })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

describe("ActiveRulesList — extension sync notifications", () => {
  it("notifies the extension after successfully deleting a rule", async () => {
    const rules = [makeRule()]
    render(<ActiveRulesList timeLimits={rules} />)
    await userEvent.click(screen.getByRole("button", { name: /delete example.com/i }))
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
    })
    expect(mockNotify).toHaveBeenCalled()
  })

  it("does not notify the extension when deletion fails", async () => {
    mockDelete.mockResolvedValue({ success: false, error: "boom" })
    const rules = [makeRule()]
    render(<ActiveRulesList timeLimits={rules} />)
    await userEvent.click(screen.getByRole("button", { name: /delete example.com/i }))
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
    })
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it("notifies the extension after successfully toggling a rule", async () => {
    const rules = [makeRule()]
    render(<ActiveRulesList timeLimits={rules} />)
    await userEvent.click(screen.getByRole("button", { name: /pause rule/i }))
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
    })
    expect(mockNotify).toHaveBeenCalled()
  })

  it("does not notify the extension when toggling fails", async () => {
    mockUpdate.mockResolvedValue({ success: false, error: "boom" })
    const rules = [makeRule()]
    render(<ActiveRulesList timeLimits={rules} />)
    await userEvent.click(screen.getByRole("button", { name: /pause rule/i }))
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
    })
    expect(mockNotify).not.toHaveBeenCalled()
  })
})
