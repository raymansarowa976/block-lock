import { auth } from "@/auth"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardTopbar } from "@/components/dashboard-topbar"
import { ExtensionBridge } from "@/components/extension-bridge"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const userId = session?.user?.id ?? ""

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <DashboardTopbar />
      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      {userId && <ExtensionBridge userId={userId} />}
    </div>
  )
}