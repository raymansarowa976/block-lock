import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { SettingsTabs } from "@/components/settings-tabs"

async function getUserData(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      image: true,
      hardLockMode: true,
      createdAt: true,
    },
  })
}

export default async function SettingsPage() {
  const session = await auth()
  const userId = session?.user?.id ?? ""
  const user = await getUserData(userId)

  if (!user) return null

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your account, defaults, and preferences
        </p>
      </div>
      <SettingsTabs user={user} />
    </div>
  )
}
