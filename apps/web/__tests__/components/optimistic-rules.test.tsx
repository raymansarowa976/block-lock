import { render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ActiveRulesList } from "@/components/active-rules-list"

vi.mock("@/lib/actions/time-limits", () => ({
  deleteTimeLimit: vi.fn(),
  updateTimeLimit: vi.fn(),
}))

import { deleteTimeLimit, updateTimeLimit } from "@/lib/actions/time-limits"
const mockDelete = deleteTimeLimit as ReturnType<typeof vi.fn>
const mockUpdate = updateTimeLimit as ReturnType<typeof vi.fn>

function makeRule(overrides = {}) {
  return {
    id: "rule-1",
    domain: "twitter.com",
    dailyLimit: null,
    isActive: true,
    schedules: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Optimistic delete
// ---------------------------------------------------------------------------

describe("ActiveRulesList — optimistic delete", () => {
  it("immediately removes the rule from the list when delete is clicked", async () => {
    mockDelete.mockImplementation(() => new Promise(() => {}))
    render(<ActiveRulesList timeLimits={[makeRule()]} />)

    await userEvent.click(screen.getByRole("button", { name: /delete twitter/i }))

    expect(screen.queryByText("twitter.com")).not.toBeInTheDocument()
  })

  it("rolls back the removed rule when the server action fails", async () => {
    let resolveAction!: (value: unknown) => void
    mockDelete.mockImplementation(
      () => new Promise((resolve) => { resolveAction = resolve }),
    )

    render(<ActiveRulesList timeLimits={[makeRule()]} />)
    await userEvent.click(screen.getByRole("button", { name: /delete twitter/i }))

    expect(screen.queryByText("twitter.com")).not.toBeInTheDocument()

    await act(async () => {
      resolveAction({ success: false, error: "Network error" })
    })

    await waitFor(() => {
      expect(screen.getByText("twitter.com")).toBeInTheDocument()
    })
  })

  it("shows a toast alert when delete fails", async () => {
    mockDelete.mockResolvedValue({ success: false, error: "Network error" })
    render(<ActiveRulesList timeLimits={[makeRule()]} />)

    await userEvent.click(screen.getByRole("button", { name: /delete twitter/i }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Optimistic toggle
// ---------------------------------------------------------------------------

describe("ActiveRulesList — optimistic toggle", () => {
  it("immediately flips the rule status when the toggle is clicked", async () => {
    mockUpdate.mockImplementation(() => new Promise(() => {}))
    render(<ActiveRulesList timeLimits={[makeRule({ isActive: true })]} />)

    await userEvent.click(screen.getByRole("button", { name: /pause rule/i }))

    expect(screen.getByRole("button", { name: /enable rule/i })).toBeInTheDocument()
  })

  it("rolls back the toggle when the server action fails", async () => {
    let resolveAction!: (value: unknown) => void
    mockUpdate.mockImplementation(
      () => new Promise((resolve) => { resolveAction = resolve }),
    )

    render(<ActiveRulesList timeLimits={[makeRule({ isActive: true })]} />)
    await userEvent.click(screen.getByRole("button", { name: /pause rule/i }))

    expect(screen.getByRole("button", { name: /enable rule/i })).toBeInTheDocument()

    await act(async () => {
      resolveAction({ success: false, error: "Network error" })
    })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pause rule/i })).toBeInTheDocument()
    })
  })

  it("shows a toast alert when toggle fails", async () => {
    mockUpdate.mockResolvedValue({ success: false, error: "Network error" })
    render(<ActiveRulesList timeLimits={[makeRule({ isActive: true })]} />)

    await userEvent.click(screen.getByRole("button", { name: /pause rule/i }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// High-latency simulation (acceptance criteria integration test)
// ---------------------------------------------------------------------------

describe("ActiveRulesList — high-latency failure simulation", () => {
  it("shows optimistic state instantly, then rolls back with toast on delayed server error", async () => {
    let resolveAction!: (value: unknown) => void
    mockDelete.mockImplementation(
      () => new Promise((resolve) => { resolveAction = resolve }),
    )

    render(<ActiveRulesList timeLimits={[makeRule({ domain: "youtube.com" })]} />)

    await userEvent.click(screen.getByRole("button", { name: /delete youtube/i }))

    expect(screen.queryByText("youtube.com")).not.toBeInTheDocument()

    await act(async () => {
      resolveAction({ success: false, error: "Request timed out" })
    })

    await waitFor(() => {
      expect(screen.getByText("youtube.com")).toBeInTheDocument()
    })

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(/timed out|error|failed/i)
  })
})
