import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ScheduleForm } from "@/components/schedule-form"

const TIME_LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const TIME_LIMITS = [{ id: TIME_LIMIT_ID, domain: "example.com" }]

vi.mock("@/lib/actions/schedules", () => ({
  createSchedule: vi.fn(),
}))

import { createSchedule } from "@/lib/actions/schedules"
const mockCreate = createSchedule as ReturnType<typeof vi.fn>

async function selectTime(label: string, time: string) {
  await userEvent.selectOptions(screen.getByRole("combobox", { name: label }), time)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ success: true, data: {} })
})

describe("ScheduleForm", () => {
  it("renders a start time dropdown", () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    expect(screen.getByRole("combobox", { name: "Start Time" })).toBeInTheDocument()
  })

  it("renders an end time dropdown", () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    expect(screen.getByRole("combobox", { name: "End Time" })).toBeInTheDocument()
  })

  it("renders day-of-week toggle buttons for all 7 days", () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    days.forEach((day) => {
      expect(screen.getByRole("button", { name: day })).toBeInTheDocument()
    })
  })

  it("renders a submit button", () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument()
  })

  it("shows a validation error when no days are selected on submit", async () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await selectTime("Start Time", "09:00")
    await selectTime("End Time", "17:00")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => {
      expect(screen.getByText(/at least one day/i)).toBeInTheDocument()
    })
  })

  it("disables the submit button while the action is pending", async () => {
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: {} }), 200)),
    )
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await selectTime("Start Time", "09:00")
    await selectTime("End Time", "17:00")
    await userEvent.click(screen.getByRole("button", { name: "Sunday" }))
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled(),
    )
  })

  it("shows a loading indicator while the action is pending", async () => {
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: {} }), 200)),
    )
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await selectTime("Start Time", "09:00")
    await selectTime("End Time", "17:00")
    await userEvent.click(screen.getByRole("button", { name: "Sunday" }))
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() =>
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument(),
    )
  })

  it("calls createSchedule with the correct payload on valid submit", async () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await selectTime("Start Time", "09:00")
    await selectTime("End Time", "17:00")
    await userEvent.click(screen.getByRole("button", { name: "Monday" }))
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
