import { ErrorBoundary } from "@/components/error-boundary"
import { TimeLimitForm } from "@/components/time-limit-form"
import { ScheduleForm } from "@/components/schedule-form"

export default function DashboardPage() {
  return (
    <ErrorBoundary>
      <main className="mx-auto max-w-2xl space-y-10 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Block a Domain</h2>
          <ErrorBoundary>
            <TimeLimitForm />
          </ErrorBoundary>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Add a Schedule</h2>
          <ErrorBoundary>
            <ScheduleForm timeLimitId="" />
          </ErrorBoundary>
        </section>
      </main>
    </ErrorBoundary>
  )
}