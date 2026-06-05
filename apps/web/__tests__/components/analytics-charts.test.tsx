import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

// recharts uses canvas/ResizeObserver APIs unavailable in jsdom — replace with
// lightweight stubs so the components under test can be exercised in isolation
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

import { BrowsingDurationChart } from "@/components/browsing-duration-chart"
import { TimeSavedChart } from "@/components/time-saved-chart"
import type { AnalyticsDataPoint } from "@/lib/actions/analytics"

const SAMPLE_DATA: AnalyticsDataPoint[] = [
  { date: "2026-05-01", totalMinutes: 45, savedMinutes: 20 },
  { date: "2026-05-02", totalMinutes: 60, savedMinutes: 30 },
  { date: "2026-05-03", totalMinutes: 30, savedMinutes: 10 },
]

// ---------------------------------------------------------------------------
// BrowsingDurationChart
// ---------------------------------------------------------------------------

describe("BrowsingDurationChart – with data", () => {
  it("renders a recharts ResponsiveContainer", () => {
    render(<BrowsingDurationChart data={SAMPLE_DATA} />)
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument()
  })

  it("renders a chart element inside the container", () => {
    render(<BrowsingDurationChart data={SAMPLE_DATA} />)
    // Either a line or bar chart is acceptable
    const chart =
      screen.queryByTestId("line-chart") ?? screen.queryByTestId("bar-chart")
    expect(chart).toBeInTheDocument()
  })

  it("renders a visible heading or label that references browsing", () => {
    render(<BrowsingDurationChart data={SAMPLE_DATA} />)
    expect(screen.getByText(/browsing/i)).toBeInTheDocument()
  })
})

describe("BrowsingDurationChart – empty state", () => {
  it("does not render a chart container when data is empty", () => {
    render(<BrowsingDurationChart data={[]} />)
    expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument()
  })

  it("shows a no-data message when data is empty", () => {
    render(<BrowsingDurationChart data={[]} />)
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// TimeSavedChart
// ---------------------------------------------------------------------------

describe("TimeSavedChart – with data", () => {
  it("renders a recharts ResponsiveContainer", () => {
    render(<TimeSavedChart data={SAMPLE_DATA} />)
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument()
  })

  it("renders a chart element inside the container", () => {
    render(<TimeSavedChart data={SAMPLE_DATA} />)
    const chart =
      screen.queryByTestId("line-chart") ?? screen.queryByTestId("bar-chart")
    expect(chart).toBeInTheDocument()
  })

  it("renders a visible heading or label that references saved time", () => {
    render(<TimeSavedChart data={SAMPLE_DATA} />)
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })
})

describe("TimeSavedChart – empty state", () => {
  it("does not render a chart container when data is empty", () => {
    render(<TimeSavedChart data={[]} />)
    expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument()
  })

  it("shows a no-data message when data is empty", () => {
    render(<TimeSavedChart data={[]} />)
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })
})
