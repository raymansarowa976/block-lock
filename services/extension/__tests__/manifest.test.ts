// @vitest-environment node
import { describe, it, expect } from "vitest"
import manifest from "../manifest.json"

type Action = {
  default_popup?: string
  default_title?: string
  default_icon?: Record<string, string>
}

type ManifestV3 = {
  manifest_version: number
  name: string
  version: string
  permissions: string[]
  host_permissions: string[]
  background: { service_worker: string; type: string }
  action: Action
}

const m = manifest as ManifestV3

describe("Manifest V3 – specification compliance", () => {
  it("uses manifest_version 3", () => {
    expect(m.manifest_version).toBe(3)
  })

  it("declares host_permissions as a dedicated top-level array", () => {
    expect(Array.isArray(m.host_permissions)).toBe(true)
    expect(m.host_permissions.length).toBeGreaterThan(0)
  })

  it("grants <all_urls> explicitly in host_permissions", () => {
    expect(m.host_permissions).toContain("<all_urls>")
  })

  it("does not embed URL match patterns inside permissions (MV3 requirement)", () => {
    const hostPatternRe = /^https?:\/\/|\*:\/\//
    const urlsInPermissions = m.permissions.filter((p) => hostPatternRe.test(p))
    expect(urlsInPermissions).toHaveLength(0)
  })

  it("registers a background service worker with module type, not a persistent background page", () => {
    expect(m.background).toHaveProperty("service_worker")
    expect(m.background.type).toBe("module")
  })

  it("declares declarativeNetRequest and declarativeNetRequestFeedback permissions", () => {
    expect(m.permissions).toContain("declarativeNetRequest")
    expect(m.permissions).toContain("declarativeNetRequestFeedback")
  })

  it("declares storage permission", () => {
    expect(m.permissions).toContain("storage")
  })

  it("declares alarms permission", () => {
    expect(m.permissions).toContain("alarms")
  })

  it("declares tabs permission for reading tab URLs in navigation events", () => {
    expect(m.permissions).toContain("tabs")
  })
})

// These tests will fail: action.default_popup is not configured yet
describe("Manifest V3 – action popup configuration", () => {
  it("registers default_popup pointing to popup.html", () => {
    expect(m.action).toHaveProperty("default_popup")
    expect(m.action.default_popup).toBe("popup.html")
  })

  it("provides a non-empty default_title for the action icon tooltip", () => {
    expect(m.action).toHaveProperty("default_title")
    expect(typeof m.action.default_title).toBe("string")
    expect((m.action.default_title as string).length).toBeGreaterThan(0)
  })
})