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

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manage your blocked websites and schedules
        </p>
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