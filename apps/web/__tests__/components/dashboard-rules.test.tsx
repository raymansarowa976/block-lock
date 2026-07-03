import { render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { DashboardRules } from "@/components/dashboard-rules"

const mockRouterRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

vi.mock("@/lib/actions/time-limits", () => ({
  createTimeLimit: vi.fn(),
  deleteTimeLimit: vi.fn(),
  updateTimeLimit: vi.fn(),
}))

vi.mock("@/components/extension-bridge", () => ({
  notifyExtensionRulesUpdated: vi.fn(),
}))

import { createTimeLimit } from "@/lib/actions/time-limits"
const mockCreate = createTimeLimit as ReturnType<typeof vi.fn>

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
})

// ---------------------------------------------------------------------------
// Core bug regression: adding a domain must show up instantly, without a
// hard reload — this is the primary Verification Pass criterion.
// ---------------------------------------------------------------------------

describe("DashboardRules — optimistic add", () => {
  it("shows the newly submitted domain in the active rules list before the server responds", async () => {
    mockCreate.mockImplementation(() => new Promise(() => {})) // never resolves
    render(<DashboardRules timeLimits={[]} />)

    await userEvent.type(screen.getByLabelText(/website/i), "newsite.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))

    await waitFor(() => {
      expect(screen.getByText("newsite.com")).toBeInTheDocument()
    })
  })

  it("increments the visible active rules count immediately on submission", async () => {
    mockCreate.mockImplementation(() => new Promise(() => {}))
    render(<DashboardRules timeLimits={[makeRule({ domain: "existing.com" })]} />)

    expect(screen.getByText(/1 website/i)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/website/i), "newsite.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))

    await waitFor(() => {
      expect(screen.getByText(/2 websites/i)).toBeInTheDocument()
    })
  })

  it("keeps existing rules visible alongside the optimistically added one", async () => {
    mockCreate.mockImplementation(() => new Promise(() => {}))
    render(<DashboardRules timeLimits={[makeRule({ domain: "existing.com" })]} />)

    await userEvent.type(screen.getByLabelText(/website/i), "newsite.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))

    await waitFor(() => {
      expect(screen.getByText("newsite.com")).toBeInTheDocument()
    })
    expect(screen.getByText("existing.com")).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Reconciliation with the server after the mutation settles
// ---------------------------------------------------------------------------

describe("DashboardRules — reconciliation after mutation settles", () => {
  it("refreshes the router cache after a successful creation", async () => {
    mockCreate.mockResolvedValue({ success: true, data: makeRule({ domain: "newsite.com" }) })
    render(<DashboardRules timeLimits={[]} />)

    await userEvent.type(screen.getByLabelText(/website/i), "newsite.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))

    await waitFor(() => {
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })

  it("does not refresh the router cache when creation fails", async () => {
    mockCreate.mockResolvedValue({ success: false, error: "This domain is already in your list." })
    render(<DashboardRules timeLimits={[]} />)

    await userEvent.type(screen.getByLabelText(/website/i), "newsite.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it("rolls back the optimistic entry when creation fails", async () => {
    let resolveAction!: (value: unknown) => void
    mockCreate.mockImplementation(
      () => new Promise((resolve) => { resolveAction = resolve }),
    )
    render(<DashboardRules timeLimits={[]} />)

    await userEvent.type(screen.getByLabelText(/website/i), "newsite.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))

    await waitFor(() => {
      expect(screen.getByText("newsite.com")).toBeInTheDocument()
    })

    await act(async () => {
      resolveAction({ success: false, error: "This domain is already in your list." })
    })

    await waitFor(() => {
      expect(screen.queryByText("newsite.com")).not.toBeInTheDocument()
    })
  })
})
