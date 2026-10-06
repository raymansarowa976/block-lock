import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

vi.mock("@/auth", () => ({ signIn: vi.fn() }))

import LoginPage from "@/app/login/page"

describe("LoginPage", () => {
  it("links to the privacy policy before sign-in", () => {
    render(<LoginPage />)
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy")
  })
})
