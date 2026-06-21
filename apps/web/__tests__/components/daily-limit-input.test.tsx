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

describe("TimeLimitForm — daily limit input controls", () => {
  it("passes null dailyLimit to createTimeLimit when the field is left blank", async () => {
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ domain: "example.com", dailyLimit: null }),
      )
    })
  })

  it("passes a positive integer dailyLimit when a valid number is entered", async () => {
    render(<TimeLimitForm />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await userEvent.type(screen.getByLabelText(/daily limit/i), "45")
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ dailyLimit: 45 }),
      )
    })
  })

  it("shows helper text indicating blank means fully blocked", () => {
    render(<TimeLimitForm />)
    expect(
      screen.getByPlaceholderText(/leave blank.*block/i),
    ).toBeInTheDocument()
  })
})
