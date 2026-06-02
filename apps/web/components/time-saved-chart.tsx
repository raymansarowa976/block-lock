"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { AnalyticsDataPoint } from "@/lib/actions/analytics"

interface Props {
  data: AnalyticsDataPoint[]
}

export function TimeSavedChart({ data }: Props) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">Time Saved by Blocking (min)</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data available</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="savedMinutes" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
