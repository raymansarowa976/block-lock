import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { SettingsTabs } from "@/components/settings-tabs"

vi.mock("@/lib/actions/settings", () => ({
  updateHardLockMode: vi.fn(),
  deleteUserAccount: vi.fn(),
}))

const defaultUser = {
  email: "test@example.com",
  name: "Test User",
  image: null,
  createdAt: new Date("2024-01-01"),
  hardLockMode: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("SettingsTabs", () => {
  it("renders all three tab triggers", () => {
    render(<SettingsTabs user={defaultUser} />)
    expect(screen.getByRole("tab", { name: /account options/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /block rules defaults/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /danger zone/i })).toBeInTheDocument()
  })

  it("shows the Account Options tab as selected by default", () => {
    render(<SettingsTabs user={defaultUser} />)
    expect(screen.getByRole("tab", { name: /account options/i })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })

  it("displays user email in the Account Options tab", () => {
    render(<SettingsTabs user={defaultUser} />)
    expect(screen.getByText("test@example.com")).toBeInTheDocument()
  })

  it("displays user name in the Account Options tab", () => {
    render(<SettingsTabs user={defaultUser} />)
    expect(screen.getByText("Test User")).toBeInTheDocument()
  })

  it("switches to Block Rules Defaults tab on click", async () => {
    render(<SettingsTabs user={defaultUser} />)
    await userEvent.click(screen.getByRole("tab", { name: /block rules defaults/i }))
    expect(screen.getByText(/hard lock mode/i)).toBeInTheDocument()
  })

  it("switches to Danger Zone tab on click", async () => {
    render(<SettingsTabs user={defaultUser} />)
    await userEvent.click(screen.getByRole("tab", { name: /danger zone/i }))
    expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument()
  })

  it("applies destructive styling to the Danger Zone tab trigger", () => {
    render(<SettingsTabs user={defaultUser} />)
    const dangerTab = screen.getByRole("tab", { name: /danger zone/i })
    expect(dangerTab.className).toMatch(/red|destructive|danger/i)
  })
})