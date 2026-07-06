import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { TimeSelect } from "@/components/time-select"

describe("TimeSelect", () => {
  it("renders a labeled dropdown", () => {
    render(<TimeSelect id="startTime" label="Start Time" value="" onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Start Time" })).toBeInTheDocument()
  })

  it("lists times in 15-minute increments covering the full day", () => {
    render(<TimeSelect id="startTime" label="Start Time" value="" onChange={() => {}} />)
    const select = screen.getByRole("combobox", { name: "Start Time" })
    expect(within(select).getByRole("option", { name: "00:00" })).toBeInTheDocument()
    expect(within(select).getByRole("option", { name: "23:45" })).toBeInTheDocument()
    expect(within(select).getAllByRole("option")).toHaveLength(24 * 4 + 1)
  })

  it("calls onChange with the selected time", async () => {
    const onChange = vi.fn()
    render(<TimeSelect id="startTime" label="Start Time" value="" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Start Time" }), "09:00")
    expect(onChange).toHaveBeenCalledWith("09:00")
  })

  it("reflects the current value as the selected option", () => {
    render(<TimeSelect id="startTime" label="Start Time" value="14:30" onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Start Time" })).toHaveValue("14:30")
  })
})
