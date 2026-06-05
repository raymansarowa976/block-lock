"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { AnalyticsDataPoint } from "@/lib/actions/analytics"

interface Props {
  data: AnalyticsDataPoint[]
}

export function BrowsingDurationChart({ data }: Props) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">Total Browsing Duration (min)</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data available</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="totalMinutes" stroke="#6366f1" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}