import { describe, it, expect, vi } from "vitest"

// next/font/google only works inside the Next.js compiler.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}))

const { metadata } = await import("@/app/layout")
const { metadata: privacyMetadata } = await import("@/app/privacy/page")

// The tab title and description show up in browser tabs, bookmarks, search
// results and the Chrome Web Store reviewer's view of blocklock.app.
describe("root layout metadata", () => {
  it("does not ship the create-next-app placeholders", () => {
    expect(JSON.stringify(metadata)).not.toMatch(/create next app/i)
  })

  it("titles pages Block Lock by default", () => {
    expect(metadata.title).toMatchObject({ default: "Block Lock" })
  })

  it("suffixes child page titles with the app name", () => {
    expect(metadata.title).toMatchObject({ template: "%s · Block Lock" })
  })

  it("describes the app", () => {
    expect(metadata.description).toMatch(/block/i)
  })

  // The template already appends "· Block Lock".
  it("child pages don't repeat the app name in their own title", () => {
    expect(privacyMetadata.title).not.toMatch(/block lock/i)
  })
})
