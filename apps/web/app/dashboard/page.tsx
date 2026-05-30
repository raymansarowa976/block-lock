import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ErrorBoundary } from "@/components/error-boundary"
import { TimeLimitForm } from "@/components/time-limit-form"
import { ScheduleForm } from "@/components/schedule-form"
import { ActiveRulesList } from "@/components/active-rules-list"

async function getUserTimeLimits(userId: string) {
  return prisma.timeLimit.findMany({
    where: { userId },
    include: { schedules: true },
    orderBy: { createdAt: "desc" },
  })
}

export default async function DashboardPage() {
  const session = await auth()
  const userId = session?.user?.id ?? ""
  const timeLimits = await getUserTimeLimits(userId)

  const activeCount = timeLimits.filter((t) => t.isActive).length
  const scheduledCount = timeLimits.filter((t) => t.schedules.length > 0).length

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your blocked websites and schedules
        </p>
      </div>

      {/* Stats chips */}
      <div className="mb-6 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
          <span className="size-1.5 rounded-full bg-slate-400" />
          {timeLimits.length} total
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-3.5 py-1.5 text-xs font-medium text-red-700 shadow-sm">
          <span className="size-1.5 rounded-full bg-red-500" />
          {activeCount} active
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-3.5 py-1.5 text-xs font-medium text-orange-700 shadow-sm">
          <span className="size-1.5 rounded-full bg-orange-400" />
          {scheduledCount} scheduled
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <ErrorBoundary>
            <TimeLimitForm />
          </ErrorBoundary>
          <ErrorBoundary>
            <ScheduleForm timeLimits={timeLimits} />
          </ErrorBoundary>
        </div>

        <div className="lg:col-span-2">
          <ErrorBoundary>
            <ActiveRulesList timeLimits={timeLimits} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}