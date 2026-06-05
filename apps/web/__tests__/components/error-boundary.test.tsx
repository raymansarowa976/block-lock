import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { ErrorBoundary } from "@/components/error-boundary"

function Bomb(): React.ReactElement {
  throw new Error("Boom")
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText("All good")).toBeInTheDocument()
  })

  it("renders a fallback UI instead of crashing when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.queryByText("All good")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("displays a user-friendly error message in the fallback", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i)
  })

  it("does not propagate the error to an unhandled exception", () => {
    expect(() =>
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      ),
    ).not.toThrow()
  })
})