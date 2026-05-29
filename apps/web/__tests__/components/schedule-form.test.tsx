import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ScheduleForm } from "@/components/schedule-form"

const TIME_LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"

vi.mock("@/lib/actions/schedules", () => ({
  createSchedule: vi.fn(),
}))

import { createSchedule } from "@/lib/actions/schedules"
const mockCreate = createSchedule as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ success: true, data: {} })
})

describe("ScheduleForm", () => {
  it("renders a start time input", () => {
    render(<ScheduleForm timeLimitId={TIME_LIMIT_ID} />)
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument()
  })

  it("renders an end time input", () => {
    render(<ScheduleForm timeLimitId={TIME_LIMIT_ID} />)
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument()
  })

  it("renders day-of-week checkboxes for all 7 days", () => {
    render(<ScheduleForm timeLimitId={TIME_LIMIT_ID} />)
    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes).toHaveLength(7)
  })

  it("renders a submit button", () => {
    render(<ScheduleForm timeLimitId={TIME_LIMIT_ID} />)
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument()
  })

  it("shows a validation error when no days are selected on submit", async () => {
    render(<ScheduleForm timeLimitId={TIME_LIMIT_ID} />)
    await userEvent.type(screen.getByLabelText(/start time/i), "09:00")
    await userEvent.type(screen.getByLabelText(/end time/i), "17:00")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => {
      expect(screen.getByText(/at least one day/i)).toBeInTheDocument()
    })
  })

  it("disables the submit button while the action is pending", async () => {
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: {} }), 200)),
    )
    render(<ScheduleForm timeLimitId={TIME_LIMIT_ID} />)
    await userEvent.type(screen.getByLabelText(/start time/i), "09:00")
    await userEvent.type(screen.getByLabelText(/end time/i), "17:00")
    await userEvent.click(screen.getAllByRole("checkbox")[0])
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled(),
    )
  })

  it("shows a loading indicator while the action is pending", async () => {
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: {} }), 200)),
    )
    render(<ScheduleForm timeLimitId={TIME_LIMIT_ID} />)
    await userEvent.type(screen.getByLabelText(/start time/i), "09:00")
    await userEvent.type(screen.getByLabelText(/end time/i), "17:00")
    await userEvent.click(screen.getAllByRole("checkbox")[0])
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() =>
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument(),
    )
  })

  it("calls createSchedule with the correct payload on valid submit", async () => {
    render(<ScheduleForm timeLimitId={TIME_LIMIT_ID} />)
    await userEvent.type(screen.getByLabelText(/start time/i), "09:00")
    await userEvent.type(screen.getByLabelText(/end time/i), "17:00")
    await userEvent.click(screen.getAllByRole("checkbox")[1]) // Monday
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          timeLimitId: TIME_LIMIT_ID,
          startTime: "09:00",
          endTime: "17:00",
        }),
      )
    })
  })
})