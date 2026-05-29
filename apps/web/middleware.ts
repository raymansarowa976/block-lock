import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  if (req.auth) return NextResponse.next()

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.redirect(new URL("/login", req.nextUrl))
})

export const config = {
  // Guard /dashboard/* and /api/* but leave /api/auth/* open for Auth.js itself
  matcher: ["/dashboard/:path*", "/api/((?!auth).*)"],
}