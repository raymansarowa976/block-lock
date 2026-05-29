import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { TimeLimitForm } from "@/components/time-limit-form"

vi.mock("@/lib/actions/time-limits", () => ({
  createTimeLimit: vi.fn(),
}))

import { createTimeLimit } from "@/lib/actions/time-limits"
const mockCreate = createTimeLimit as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ success: true, data: {} })
})

describe("TimeLimitForm", () => {
  it("renders a domain input field", () => {
    render(<TimeLimitForm />)
    expect(screen.getByLabelText(/domain/i)).toBeInTheDocument()
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
      expect(screen.getByText(/domain is required/i)).toBeInTheDocument()
    })
  })

  it("shows a validation error for an invalid domain format", async () => {
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/domain/i), "not a domain!!!")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid domain/i)).toBeInTheDocument()
    })
  })

  it("disables the submit button while the action is pending", async () => {
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: {} }), 200)),
    )
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/domain/i), "example.com")
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
    await userEvent.type(screen.getByLabelText(/domain/i), "example.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() =>
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument(),
    )
  })

  it("calls createTimeLimit with the correct data on valid submit", async () => {
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/domain/i), "example.com")
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
    await userEvent.type(screen.getByLabelText(/domain/i), "example.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/domain/i)).toHaveValue("")
    })
  })
})