import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { DangerZone } from "@/components/danger-zone"

vi.mock("@/lib/actions/settings", () => ({
  deleteUserAccount: vi.fn(),
}))

import { deleteUserAccount } from "@/lib/actions/settings"
const mockDelete = deleteUserAccount as ReturnType<typeof vi.fn>

const USER_EMAIL = "test@example.com"

beforeEach(() => {
  vi.clearAllMocks()
  mockDelete.mockResolvedValue({ success: true })
})

describe("DangerZone", () => {
  it("renders a delete account button", () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument()
  })

  it("opens a confirmation modal when delete button is clicked", async () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("displays the user email requirement in the modal", async () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }))
    expect(screen.getByText(USER_EMAIL)).toBeInTheDocument()
  })

  it("renders an email confirmation input in the modal", async () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }))
    expect(screen.getByLabelText(/type your email/i)).toBeInTheDocument()
  })

  it("disables the confirm button until the typed email matches exactly", async () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }))

    const confirmBtn = screen.getByRole("button", { name: /confirm/i })
    expect(confirmBtn).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/type your email/i), "wrong@email.com")
    expect(confirmBtn).toBeDisabled()
  })

  it("enables the confirm button when the typed email matches", async () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }))

    await userEvent.type(screen.getByLabelText(/type your email/i), USER_EMAIL)
    expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled()
  })

  it("calls deleteUserAccount with the email when confirmed", async () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }))

    await userEvent.type(screen.getByLabelText(/type your email/i), USER_EMAIL)
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(USER_EMAIL)
    })
  })

  it("closes the modal when cancel is clicked", async () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows a loading state on the confirm button during deletion", async () => {
    mockDelete.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 200)),
    )
    render(<DangerZone userEmail={USER_EMAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }))

    await userEvent.type(screen.getByLabelText(/type your email/i), USER_EMAIL)
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled()
    })
  })

  it("displays a warning that this action is irreversible", () => {
    render(<DangerZone userEmail={USER_EMAIL} />)
    expect(screen.getByText(/irreversible|cannot be undone|permanent/i)).toBeInTheDocument()
  })
})