import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { HardLockToggle } from "@/components/hard-lock-toggle"

vi.mock("@/lib/actions/settings", () => ({
  updateHardLockMode: vi.fn(),
}))

import { updateHardLockMode } from "@/lib/actions/settings"
const mockUpdate = updateHardLockMode as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdate.mockResolvedValue({ success: true })
})

describe("HardLockToggle", () => {
  it("renders a toggle switch", () => {
    render(<HardLockToggle enabled={false} />)
    expect(screen.getByRole("switch")).toBeInTheDocument()
  })

  it("shows the toggle as unchecked when disabled", () => {
    render(<HardLockToggle enabled={false} />)
    expect(screen.getByRole("switch")).not.toBeChecked()
  })

  it("shows the toggle as checked when enabled", () => {
    render(<HardLockToggle enabled={true} />)
    expect(screen.getByRole("switch")).toBeChecked()
  })

  it("displays a label describing Hard Lock Mode", () => {
    render(<HardLockToggle enabled={false} />)
    expect(screen.getByText(/hard lock mode/i)).toBeInTheDocument()
  })

  it("displays a description of what hard lock mode does", () => {
    render(<HardLockToggle enabled={false} />)
    expect(
      screen.getByText(/forbid.*delet|prevent.*modif|block.*alter/i),
    ).toBeInTheDocument()
  })

  it("calls updateHardLockMode with true when toggled on", async () => {
    render(<HardLockToggle enabled={false} />)
    await userEvent.click(screen.getByRole("switch"))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(true)
    })
  })

  it("calls updateHardLockMode with false when toggled off", async () => {
    render(<HardLockToggle enabled={true} />)
    await userEvent.click(screen.getByRole("switch"))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(false)
    })
  })

  it("disables the toggle while the update is pending", async () => {
    mockUpdate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 200)),
    )
    render(<HardLockToggle enabled={false} />)
    await userEvent.click(screen.getByRole("switch"))

    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeDisabled()
    })
  })
})