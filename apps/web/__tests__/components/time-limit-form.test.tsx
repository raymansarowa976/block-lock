import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { TimeLimitForm } from "@/components/time-limit-form"

vi.mock("@/lib/actions/time-limits", () => ({
  createTimeLimit: vi.fn(),
}))

vi.mock("@/components/extension-bridge", () => ({
  notifyExtensionRulesUpdated: vi.fn(),
}))

import { createTimeLimit } from "@/lib/actions/time-limits"
import { notifyExtensionRulesUpdated } from "@/components/extension-bridge"
const mockCreate = createTimeLimit as ReturnType<typeof vi.fn>
const mockNotify = notifyExtensionRulesUpdated as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ success: true, data: {} })
})

describe("TimeLimitForm", () => {
  it("renders a website input field", () => {
    render(<TimeLimitForm />)
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument()
  })

  it("renders a daily limit input field", () => {
    render(<TimeLimitForm />)
    expect(screen.getByLabelText(/daily limit/i)).toBeInTheDocument()
  })

  it("renders a submit button", () => {
    render(<TimeLimitForm />)
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument()
  })

  it("shows a validation error when domain is empty on submit", async () => {
    render(<TimeLimitForm />)
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(screen.getByText(/website address is required/i)).toBeInTheDocument()
    })
  })

  it("shows a validation error for an invalid website address", async () => {
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "not a domain!!!")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid website/i)).toBeInTheDocument()
    })
  })

  it("disables the submit button while the action is pending", async () => {
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: {} }), 200)),
    )
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add/i })).toBeDisabled(),
    )
  })

  it("shows a loading indicator while the action is pending", async () => {
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: {} }), 200)),
    )
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() =>
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument(),
    )
  })

  it("calls createTimeLimit with the correct data on valid submit", async () => {
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await userEvent.type(screen.getByLabelText(/daily limit/i), "30")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ domain: "example.com", dailyLimit: 30 }),
      )
    })
  })

  it("resets the form after a successful submission", async () => {
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/website/i)).toHaveValue("")
    })
  })

  it("notifies the extension to re-sync after a successful submission", async () => {
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalled()
    })
  })

  it("does not notify the extension when the submission fails", async () => {
    mockCreate.mockResolvedValue({ success: false, error: "This domain is already in your list." })
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })
    expect(mockNotify).not.toHaveBeenCalled()
  })
})