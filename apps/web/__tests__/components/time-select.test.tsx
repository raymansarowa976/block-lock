import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { TimeSelect } from "@/components/time-select"

describe("TimeSelect", () => {
  it("renders a labeled dropdown and AM/PM buttons", () => {
    render(<TimeSelect id="startTime" label="Start Time" value="" onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Start Time" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "AM" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "PM" })).toBeInTheDocument()
  })

  it("lists 12-hour times in 15-minute increments, without AM/PM in the label", () => {
    render(<TimeSelect id="startTime" label="Start Time" value="" onChange={() => {}} />)
    const select = screen.getByRole("combobox", { name: "Start Time" })
    expect(within(select).getByRole("option", { name: "12:00" })).toBeInTheDocument()
    expect(within(select).getByRole("option", { name: "11:45" })).toBeInTheDocument()
    expect(within(select).getAllByRole("option")).toHaveLength(12 * 4 + 1)
  })

  it("marks AM as pressed for a 24-hour value before noon", () => {
    render(<TimeSelect id="startTime" label="Start Time" value="09:30" onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "AM" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "PM" })).toHaveAttribute("aria-pressed", "false")
  })

  it("marks PM as pressed for a 24-hour value at or after noon", () => {
    render(<TimeSelect id="startTime" label="Start Time" value="14:30" onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "PM" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "AM" })).toHaveAttribute("aria-pressed", "false")
  })

  it("handles the midnight/noon boundary correctly (both show 12 on the dial)", () => {
    const { rerender } = render(<TimeSelect id="startTime" label="Start Time" value="00:15" onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Start Time" })).toHaveValue("12:15")
    expect(screen.getByRole("button", { name: "AM" })).toHaveAttribute("aria-pressed", "true")

    rerender(<TimeSelect id="startTime" label="Start Time" value="12:15" onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Start Time" })).toHaveValue("12:15")
    expect(screen.getByRole("button", { name: "PM" })).toHaveAttribute("aria-pressed", "true")
  })

  it("reflects the current value's 12-hour time as the selected dropdown option", () => {
    render(<TimeSelect id="startTime" label="Start Time" value="14:30" onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Start Time" })).toHaveValue("02:30")
  })

  it("calls onChange with the 24-hour value, preserving the period, when a dropdown time is selected", async () => {
    const onChange = vi.fn()
    render(<TimeSelect id="startTime" label="Start Time" value="09:00" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Start Time" }), "02:30")
    expect(onChange).toHaveBeenCalledWith("02:30")
  })

  it("calls onChange with the corresponding 24-hour value when PM is clicked", async () => {
    const onChange = vi.fn()
    render(<TimeSelect id="startTime" label="Start Time" value="09:30" onChange={onChange} />)
    await userEvent.click(screen.getByRole("button", { name: "PM" }))
    expect(onChange).toHaveBeenCalledWith("21:30")
  })

  it("calls onChange with the corresponding 24-hour value when AM is clicked", async () => {
    const onChange = vi.fn()
    render(<TimeSelect id="startTime" label="Start Time" value="14:30" onChange={onChange} />)
    await userEvent.click(screen.getByRole("button", { name: "AM" }))
    expect(onChange).toHaveBeenCalledWith("02:30")
  })

  it("defaults to 12:00 when AM or PM is clicked with no prior value", async () => {
    const onChange = vi.fn()
    render(<TimeSelect id="startTime" label="Start Time" value="" onChange={onChange} />)
    await userEvent.click(screen.getByRole("button", { name: "PM" }))
    expect(onChange).toHaveBeenCalledWith("12:00")
  })
})
