import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

// This import will fail until popup.tsx is implemented – that is intentional (TDD red phase)
import { Popup } from "../src/popup"

const mockStorageGet = vi.fn()

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: mockStorageGet,
    },
  },
})

beforeEach(() => {
  mockStorageGet.mockReset()
})

describe("Popup – account binding states", () => {
  it("renders without crashing", async () => {
    mockStorageGet.mockResolvedValue({})
    expect(() => render(<Popup />)).not.toThrow()
  })

  it("shows an unbound / not-connected state when no userId is in storage", async () => {
    mockStorageGet.mockResolvedValue({})
    render(<Popup />)
    await waitFor(() =>
      expect(screen.getByText(/not connected/i)).toBeInTheDocument(),
    )
  })

  it("shows a connected / bound state when userId is present in storage", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    await waitFor(() =>
      expect(screen.getByText(/connected/i)).toBeInTheDocument(),
    )
  })

  it("renders a sync status indicator when the account is bound", async () => {
    mockStorageGet.mockResolvedValue({
      userId: "user-abc-123",
      lastSync: "2026-06-01T12:00:00.000Z",
    })
    render(<Popup />)
    await waitFor(() =>
      expect(screen.getByTestId("sync-status")).toBeInTheDocument(),
    )
  })

  it("shows 'Never synced' when userId exists but lastSync has not been recorded", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    await waitFor(() =>
      expect(screen.getByText(/never synced/i)).toBeInTheDocument(),
    )
  })

  it("renders a connect link when account is unbound", async () => {
    mockStorageGet.mockResolvedValue({})
    render(<Popup />)
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /connect/i })).toBeInTheDocument(),
    )
  })

  it("does not render a connect link when account is already bound", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /connect/i }),
      ).not.toBeInTheDocument(),
    )
  })

  it("renders a header landmark containing the extension branding", async () => {
    mockStorageGet.mockResolvedValue({})
    render(<Popup />)
    await waitFor(() =>
      expect(screen.getByRole("banner")).toBeInTheDocument(),
    )
  })
})

describe("Popup – responsive panel sizing (Tailwind)", () => {
  it("root container uses w-full to fill available panel width", async () => {
    mockStorageGet.mockResolvedValue({})
    const { container } = render(<Popup />)
    await waitFor(() => {
      const root = container.firstElementChild as HTMLElement
      expect(root.className).toMatch(/\bw-full\b/)
    })
  })

  it("root container enforces a min-w so content is not clipped in narrow panels", async () => {
    mockStorageGet.mockResolvedValue({})
    const { container } = render(<Popup />)
    await waitFor(() => {
      const root = container.firstElementChild as HTMLElement
      expect(root.className).toMatch(/\bmin-w-/)
    })
  })

  it("root container enforces a max-w to prevent overflow in wide panels", async () => {
    mockStorageGet.mockResolvedValue({})
    const { container } = render(<Popup />)
    await waitFor(() => {
      const root = container.firstElementChild as HTMLElement
      expect(root.className).toMatch(/\bmax-w-/)
    })
  })

  it("root container enforces a min-h so the panel is not collapsed to nothing", async () => {
    mockStorageGet.mockResolvedValue({})
    const { container } = render(<Popup />)
    await waitFor(() => {
      const root = container.firstElementChild as HTMLElement
      expect(root.className).toMatch(/\bmin-h-/)
    })
  })

  it("popup heading uses a Tailwind text-size utility for readable typography", async () => {
    mockStorageGet.mockResolvedValue({})
    render(<Popup />)
    await waitFor(() => {
      const heading = screen.getByRole("heading")
      expect(heading.className).toMatch(/\btext-/)
    })
  })
})