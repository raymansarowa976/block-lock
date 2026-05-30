import { Shield } from "lucide-react"
import { auth } from "@/auth"

export async function DashboardTopbar() {
  const session = await auth()
  const name = session?.user?.name ?? ""
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-red-600">
          <Shield className="size-4 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900">Block Lock</span>
      </div>

      <div
        className="flex size-8 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white"
        title={name}
        aria-label={name}
      >
        {initials || "U"}
      </div>
    </header>
  )
}