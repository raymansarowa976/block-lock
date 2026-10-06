import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { InsightBriefing } from "@/components/insight-briefing"

async function getLatestInsight(userId: string) {
  return prisma.productivityInsight.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })
}

export default async function IntelligencePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const insight = await getLatestInsight(session.user.id)

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Intelligence</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your AI coach&apos;s briefing on the last 7 days of browsing activity
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {insight ? (
          <InsightBriefing summary={insight.summary} generatedAt={insight.createdAt} />
        ) : (
          <p className="text-sm text-slate-500">
            No briefing yet — check back after your next weekly analysis runs.
          </p>
        )}
      </div>
    </div>
  )
}
