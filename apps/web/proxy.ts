import { auth } from "@/auth"
import { NextResponse } from "next/server"

export const proxy = auth((req) => {
  if (req.auth) return NextResponse.next()

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.redirect(new URL("/login", req.nextUrl))
})

export const config = {
  // Guard /dashboard/* and /api/* but leave /api/auth/* open for Auth.js
  // and /api/sync open for the extension service worker (no cookie context)
  matcher: ["/dashboard/:path*", "/api/((?!auth|sync).*)"],
}