import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getAnalyticsData } from "@/lib/actions/analytics"
import { BrowsingDurationChart } from "@/components/browsing-duration-chart"
import { TimeSavedChart } from "@/components/time-saved-chart"

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const result = await getAnalyticsData("week")
  const data = result.success ? result.data : []

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your browsing activity over the last 7 days
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <BrowsingDurationChart data={data} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <TimeSavedChart data={data} />
        </div>
      </div>
    </div>
  )
}