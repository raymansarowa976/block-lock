import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ScheduleForm } from "@/components/schedule-form"

const TIME_LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k"
const TIME_LIMITS = [{ id: TIME_LIMIT_ID, domain: "example.com" }]

vi.mock("@/lib/actions/schedules", () => ({
  createScheduleForDomain: vi.fn(),
}))

import { createScheduleForDomain } from "@/lib/actions/schedules"
const mockCreate = createScheduleForDomain as ReturnType<typeof vi.fn>

async function selectTime(label: string, time24: string) {
  const [hourStr, minute] = time24.split(":")
  const hour24 = Number(hourStr)
  const period = hour24 >= 12 ? "PM" : "AM"
  const displayHour = hour24 % 12 === 0 ? 12 : hour24 % 12
  const displayValue = `${String(displayHour).padStart(2, "0")}:${minute}`

  const group = screen.getByRole("group", { name: label })
  await userEvent.selectOptions(within(group).getByRole("combobox"), displayValue)
  await userEvent.click(within(group).getByRole("button", { name: period }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ success: true, data: {} })
})

describe("ScheduleForm", () => {
  it("renders a start time dropdown with AM/PM buttons", () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    const group = screen.getByRole("group", { name: "Start Time" })
    expect(within(group).getByRole("combobox")).toBeInTheDocument()
    expect(within(group).getByRole("button", { name: "AM" })).toBeInTheDocument()
    expect(within(group).getByRole("button", { name: "PM" })).toBeInTheDocument()
  })

  it("renders an end time dropdown with AM/PM buttons", () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    const group = screen.getByRole("group", { name: "End Time" })
    expect(within(group).getByRole("combobox")).toBeInTheDocument()
    expect(within(group).getByRole("button", { name: "AM" })).toBeInTheDocument()
    expect(within(group).getByRole("button", { name: "PM" })).toBeInTheDocument()
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

  it("calls createScheduleForDomain with the correct 24-hour payload on valid submit", async () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await selectTime("Start Time", "09:00")
    await selectTime("End Time", "17:00")
    await userEvent.click(screen.getByRole("button", { name: "Monday" }))
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "example.com",
          startTime: "09:00",
          endTime: "17:00",
        }),
      )
    })
  })

  it("calls createScheduleForDomain for a website not in the existing rules list", async () => {
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    await userEvent.type(screen.getByLabelText(/website/i), "reddit.com")
    await selectTime("Start Time", "15:15")
    await selectTime("End Time", "16:00")
    await userEvent.click(screen.getByRole("button", { name: "Sunday" }))
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ domain: "reddit.com" }),
      )
    })
  })

  it("shows the server-provided error when the website is already blocked", async () => {
    mockCreate.mockResolvedValue({
      success: false,
      error: "Cannot add a schedule to a website that is already blocked",
    })
    render(<ScheduleForm timeLimits={TIME_LIMITS} />)
    await userEvent.type(screen.getByLabelText(/website/i), "example.com")
    await selectTime("Start Time", "09:00")
    await selectTime("End Time", "17:00")
    await userEvent.click(screen.getByRole("button", { name: "Monday" }))
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => {
      expect(screen.getByText(/already blocked/i)).toBeInTheDocument()
    })
  })
})
