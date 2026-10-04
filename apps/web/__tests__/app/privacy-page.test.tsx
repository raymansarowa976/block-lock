import { render, screen, within } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import PrivacyPage, { metadata } from "@/app/privacy/page"
import { PRIVACY_CONTACT_EMAIL } from "@/lib/constants"

// The Chrome Web Store listing links here, so these assertions pin the
// disclosures its User Data policy requires against what the code actually
// collects (services/extension/src/analytics-buffer.ts → /api/analytics).
function section(name: RegExp) {
  return screen.getByRole("region", { name })
}

describe("PrivacyPage", () => {
  it("exports a page title for the listing link", () => {
    expect(metadata.title).toMatch(/privacy policy/i)
  })

  it("renders a top-level heading and an effective date", () => {
    render(<PrivacyPage />)
    expect(screen.getByRole("heading", { level: 1, name: /privacy policy/i })).toBeInTheDocument()
    expect(screen.getByText(/last updated/i)).toBeInTheDocument()
  })

  it("discloses that the extension collects visited domains and time on site", () => {
    render(<PrivacyPage />)
    const collected = section(/information we collect/i)
    expect(within(collected).getAllByText(/domain/i).length).toBeGreaterThan(0)
    expect(within(collected).getAllByText(/time spent/i).length).toBeGreaterThan(0)
    // Only the hostname leaves the browser — paths, queries and content never do
    expect(within(collected).getByText(/full urls/i)).toBeInTheDocument()
  })

  it("discloses the Google account data received at sign-in", () => {
    render(<PrivacyPage />)
    const collected = section(/information we collect/i)
    expect(within(collected).getByText(/email address/i)).toBeInTheDocument()
  })

  it("names every third party that receives user data", () => {
    render(<PrivacyPage />)
    const sharing = section(/how we share/i)
    for (const vendor of [/openai/i, /vercel/i, /upstash/i, /google/i]) {
      expect(within(sharing).getAllByText(vendor).length).toBeGreaterThan(0)
    }
    expect(within(sharing).getByText(/do not sell/i)).toBeInTheDocument()
  })

  it("includes the Chrome Web Store Limited Use statement", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/limited use requirements/i)).toBeInTheDocument()
  })

  it("explains retention and how to delete all data", () => {
    render(<PrivacyPage />)
    const retention = section(/retention and deletion/i)
    expect(within(retention).getByText(/delete account/i)).toBeInTheDocument()
    expect(within(retention).getAllByText(/settings/i).length).toBeGreaterThan(0)
  })

  it("provides a contact email link", () => {
    render(<PrivacyPage />)
    const link = within(section(/^contact$/i)).getByRole("link", { name: PRIVACY_CONTACT_EMAIL })
    expect(link).toHaveAttribute("href", `mailto:${PRIVACY_CONTACT_EMAIL}`)
  })
})
