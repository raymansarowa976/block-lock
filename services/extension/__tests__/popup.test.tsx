import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

// This import will fail until popup.tsx is implemented – that is intentional (TDD red phase)
import { Popup } from "../src/popup"
import { API_BASE } from "../src/config"

const mockStorageGet = vi.fn()
const mockSendMessage = vi.fn()
const mockOnChangedAdd = vi.fn()
const mockOnChangedRemove = vi.fn()

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockSendMessage,
  },
  storage: {
    local: {
      get: mockStorageGet,
    },
    onChanged: {
      addListener: mockOnChangedAdd,
      removeListener: mockOnChangedRemove,
    },
  },
})

beforeEach(() => {
  mockStorageGet.mockReset()
  mockSendMessage.mockReset().mockResolvedValue({ ok: true })
  mockOnChangedAdd.mockReset()
  mockOnChangedRemove.mockReset()
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
describe("Popup – local disconnect fallback", () => {
  it("shows a Disconnect button when the account is bound", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument(),
    )
  })

  it("does not show a Disconnect button when the account is unbound", async () => {
    mockStorageGet.mockResolvedValue({})
    render(<Popup />)
    await waitFor(() => expect(screen.getByText(/not connected/i)).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /disconnect/i })).not.toBeInTheDocument()
  })

  it("does not show a Disconnect button when the session has expired (nothing left to disconnect)", async () => {
    mockStorageGet.mockResolvedValue({ authError: "session_expired" })
    render(<Popup />)
    await waitFor(() => expect(screen.getByText(/session expired/i)).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /disconnect/i })).not.toBeInTheDocument()
  })

  it("asks the background worker to sign out when Disconnect is clicked", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    fireEvent.click(await screen.findByRole("button", { name: /disconnect/i }))
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith({ type: "BLOCK_LOCK_SIGNOUT" }),
    )
  })

  it("switches to the not-connected state after disconnecting", async () => {
    mockStorageGet.mockResolvedValueOnce({ userId: "user-abc-123" }).mockResolvedValue({})
    render(<Popup />)
    fireEvent.click(await screen.findByRole("button", { name: /disconnect/i }))
    await waitFor(() => expect(screen.getByText(/not connected/i)).toBeInTheDocument())
  })

  it("re-reads storage even if the background worker fails to respond", async () => {
    mockSendMessage.mockRejectedValue(new Error("Could not establish connection"))
    mockStorageGet.mockResolvedValueOnce({ userId: "user-abc-123" }).mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    fireEvent.click(await screen.findByRole("button", { name: /disconnect/i }))
    await waitFor(() => expect(mockStorageGet).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("button", { name: /disconnect/i })).not.toBeDisabled()
  })
})

describe("Popup – sync error reporting", () => {
  it("explains that the server couldn't be reached, naming the API host it tried", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123", syncError: "network" })
    render(<Popup />)
    const status = await screen.findByTestId("sync-status")
    expect(status).toHaveTextContent(/couldn't reach/i)
    expect(status).toHaveTextContent(API_BASE)
  })

  it("explains a server-side sync failure", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123", syncError: "server" })
    render(<Popup />)
    expect(await screen.findByTestId("sync-status")).toHaveTextContent(/server error/i)
  })

  it("explains a failure to apply the synced rules", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123", syncError: "rules" })
    render(<Popup />)
    expect(await screen.findByTestId("sync-status")).toHaveTextContent(/couldn't apply/i)
  })

  it("keeps showing the last successful sync time alongside a newer failure", async () => {
    mockStorageGet.mockResolvedValue({
      userId: "user-abc-123",
      lastSync: "2026-06-01T12:00:00.000Z",
      syncError: "network",
    })
    render(<Popup />)
    const status = await screen.findByTestId("sync-status")
    expect(status).toHaveTextContent(/last synced/i)
    expect(status).toHaveTextContent(/couldn't reach/i)
  })

  it("tells the user it will retry automatically", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123", syncError: "server" })
    render(<Popup />)
    expect(await screen.findByTestId("sync-status")).toHaveTextContent(/retrying automatically/i)
  })

  it("shows no error when syncError is cleared", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123", syncError: null })
    render(<Popup />)
    const status = await screen.findByTestId("sync-status")
    expect(status).toHaveTextContent(/never synced/i)
    expect(status).not.toHaveTextContent(/couldn't|error/i)
  })

  it("requests syncError from storage", async () => {
    mockStorageGet.mockResolvedValue({})
    render(<Popup />)
    await waitFor(() =>
      expect(mockStorageGet).toHaveBeenCalledWith(expect.arrayContaining(["syncError"])),
    )
  })
})

describe("Popup – live sync", () => {
  it("asks the background worker to sync as soon as it opens", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith({ type: "BLOCK_LOCK_SYNC_NOW" }),
    )
  })

  it("still renders if the background worker can't be reached for the sync", async () => {
    mockSendMessage.mockRejectedValue(new Error("Could not establish connection"))
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    expect(await screen.findByText(/never synced/i)).toBeInTheDocument()
  })

  it("updates in place when the sync result lands in storage", async () => {
    mockStorageGet
      .mockResolvedValueOnce({ userId: "user-abc-123", syncError: "server" })
      .mockResolvedValue({ userId: "user-abc-123", lastSync: "2026-06-01T12:00:00.000Z", syncError: null })
    render(<Popup />)
    await screen.findByText(/server error/i)
    const [listener] = mockOnChangedAdd.mock.calls[0]
    listener({ lastSync: { newValue: "2026-06-01T12:00:00.000Z" } }, "local")
    await waitFor(() => expect(screen.getByText(/last synced/i)).toBeInTheDocument())
    expect(screen.queryByText(/server error/i)).not.toBeInTheDocument()
  })

  it("ignores changes to other storage areas", async () => {
    mockStorageGet.mockResolvedValue({ userId: "user-abc-123" })
    render(<Popup />)
    await screen.findByText(/never synced/i)
    const [listener] = mockOnChangedAdd.mock.calls[0]
    listener({ foo: { newValue: 1 } }, "sync")
    expect(mockStorageGet).toHaveBeenCalledTimes(1)
  })

  it("stops listening for storage changes when closed", async () => {
    mockStorageGet.mockResolvedValue({})
    const { unmount } = render(<Popup />)
    await waitFor(() => expect(mockOnChangedAdd).toHaveBeenCalled())
    const [listener] = mockOnChangedAdd.mock.calls[0]
    unmount()
    expect(mockOnChangedRemove).toHaveBeenCalledWith(listener)
  })
})
