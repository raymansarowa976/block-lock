"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, BarChart2, Clock, Sparkles, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/dashboard/schedules", icon: Clock, label: "Schedules" },
  { href: "/dashboard/intelligence", icon: Sparkles, label: "Intelligence" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
]

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white px-3 py-4">
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-red-50 text-red-600"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon className={cn("size-5 shrink-0", isActive ? "text-red-600" : "text-slate-500")} />
            {label}
          </Link>
        )
      })}
    </aside>
  )
}