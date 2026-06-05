import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { BlockedPage } from "../src/blocked-page"

const mockStorageGet = vi.fn()

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: mockStorageGet,
    },
  },
})

function setSearchParams(params: Record<string, string>) {
  const url = new URL("chrome-extension://fake-id/blocked.html")
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  Object.defineProperty(window, "location", {
    value: { search: url.search },
    writable: true,
  })
}

function makeStoredRule(overrides: {
  domain?: string
  dailyLimit?: number | null
  isActive?: boolean
} = {}) {
  return {
    id: "rid-1",
    userId: "user-123",
    domain: overrides.domain ?? "reddit.com",
    dailyLimit: overrides.dailyLimit ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

beforeEach(() => {
  mockStorageGet.mockReset()
  setSearchParams({ domain: "reddit.com" })
})

// ---------------------------------------------------------------------------
// BLOCKED heading
// ---------------------------------------------------------------------------

describe("BlockedPage – BLOCKED heading", () => {
  it("renders the text BLOCKED", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule()] })
    render(<BlockedPage />)
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /blocked/i })).toBeInTheDocument(),
    )
  })

  it("heading uses a red Tailwind colour class", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule()] })
    render(<BlockedPage />)
    await waitFor(() => {
      const heading = screen.getByRole("heading", { name: /blocked/i })
      expect(heading.className).toMatch(/\btext-red-/)
    })
  })

  it("heading uses a bold Tailwind font-weight class", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule()] })
    render(<BlockedPage />)
    await waitFor(() => {
      const heading = screen.getByRole("heading", { name: /blocked/i })
      expect(heading.className).toMatch(/\bfont-bold\b/)
    })
  })
})

// ---------------------------------------------------------------------------
// Shield logo
// ---------------------------------------------------------------------------

describe("BlockedPage – shield logo", () => {
  it("renders an SVG logo", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule()] })
    const { container } = render(<BlockedPage />)
    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull()
    })
  })

  it("logo SVG has an aria-label identifying it as the Block Lock logo", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule()] })
    render(<BlockedPage />)
    await waitFor(() => {
      expect(screen.getByLabelText(/block lock/i)).toBeInTheDocument()
    })
  })

  it("logo appears above the block duration message", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule()] })
    const { container } = render(<BlockedPage />)
    await waitFor(() => {
      const svg = container.querySelector("svg")!
      const duration = screen.getByTestId("block-duration")
      expect(
        svg.compareDocumentPosition(duration) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// Blocked domain display
// ---------------------------------------------------------------------------

describe("BlockedPage – domain display", () => {
  it("shows the blocked domain from the URL search param", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule({ domain: "reddit.com" })] })
    setSearchParams({ domain: "reddit.com" })
    render(<BlockedPage />)
    await waitFor(() =>
      expect(screen.getByText(/reddit\.com/)).toBeInTheDocument(),
    )
  })

  it("shows a different domain when the URL param changes", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule({ domain: "youtube.com" })] })
    setSearchParams({ domain: "youtube.com" })
    render(<BlockedPage />)
    await waitFor(() =>
      expect(screen.getByText(/youtube\.com/)).toBeInTheDocument(),
    )
  })
})

// ---------------------------------------------------------------------------
// Block duration
// ---------------------------------------------------------------------------

describe("BlockedPage – block duration", () => {
  it("renders the block-duration element", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule()] })
    render(<BlockedPage />)
    await waitFor(() =>
      expect(screen.getByTestId("block-duration")).toBeInTheDocument(),
    )
  })

  it("shows an indefinite blocked message when dailyLimit is null", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule({ dailyLimit: null })] })
    render(<BlockedPage />)
    await waitFor(() =>
      expect(screen.getByTestId("block-duration")).toHaveTextContent(/always blocked|indefinitely/i),
    )
  })

  it("shows the daily limit in minutes when dailyLimit is set", async () => {
    mockStorageGet.mockResolvedValue({ rules: [makeStoredRule({ dailyLimit: 30 })] })
    render(<BlockedPage />)
    await waitFor(() => {
      const duration = screen.getByTestId("block-duration")
      expect(duration.textContent).toMatch(/30\s*min/i)
    })
  })

  it("shows a fallback message when no matching rule is found in storage", async () => {
    mockStorageGet.mockResolvedValue({ rules: [] })
    render(<BlockedPage />)
    await waitFor(() =>
      expect(screen.getByTestId("block-duration")).toHaveTextContent(/blocked/i),
    )
  })

  it("shows a loading state while storage is being read", () => {
    mockStorageGet.mockReturnValue(new Promise(() => {}))
    render(<BlockedPage />)
    expect(screen.getByTestId("block-duration")).toHaveTextContent(/loading/i)
  })
})