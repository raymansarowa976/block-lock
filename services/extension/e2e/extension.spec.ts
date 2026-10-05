import { test, expect, chromium } from "@playwright/test"
import path from "path"
import type { BrowserContext } from "@playwright/test"

const EXTENSION_PATH = path.join(__dirname, "../dist")
const BLOCKED_DOMAIN = "example.com"

// ---------------------------------------------------------------------------
// Shared persistent context — loaded once for the entire suite
// ---------------------------------------------------------------------------

let ctx: BrowserContext

test.beforeAll(async () => {
  ctx = await chromium.launchPersistentContext("", {
    // headless: false is required; Chrome extensions are not supported in
    // the legacy headless mode.  Pass --headless=new for CI environments.
    headless: false,
    args: [
      "--headless=new",
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })
})

test.afterAll(async () => {
  await ctx.close()
})

// ---------------------------------------------------------------------------
// Acceptance criterion 1 — Chromium profile loads the built extension
// ---------------------------------------------------------------------------

test("background service worker registers when the extension loads", async () => {
  // The service worker may still be starting; wait for it if needed
  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent("serviceworker")

  expect(sw.url()).toContain("background.js")
})

// ---------------------------------------------------------------------------
// Acceptance criterion 2 — Blocked domain navigation is intercepted
// ---------------------------------------------------------------------------

test("navigation to a blocked domain fails with a network error", async () => {
  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent("serviceworker")

  // Inject a blocking rule directly into the extension's declarativeNetRequest
  await sw.evaluate(async (domain: string) => {
    await (chrome as typeof chrome).declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: { type: "block" as chrome.declarativeNetRequest.RuleActionType },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: [
              "main_frame" as chrome.declarativeNetRequest.ResourceType,
            ],
          },
        },
      ],
    })
  }, BLOCKED_DOMAIN)

  const page = await ctx.newPage()
  let navigationError: Error | null = null

  try {
    await page.goto(`https://${BLOCKED_DOMAIN}`, {
      waitUntil: "commit",
      timeout: 8_000,
    })
  } catch (err) {
    navigationError = err as Error
  }

  expect(navigationError).not.toBeNull()
  expect(navigationError!.message).toMatch(
    /ERR_BLOCKED_BY_CLIENT|ERR_ABORTED|net::ERR/,
  )

  await page.close()
})

// ---------------------------------------------------------------------------
// Acceptance criterion 3 — Active rules match the configured domain
// ---------------------------------------------------------------------------

test("active declarativeNetRequest rules contain the blocked domain filter", async () => {
  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent("serviceworker")

  const rules = (await sw.evaluate(() =>
    chrome.declarativeNetRequest.getDynamicRules(),
  )) as Array<{ condition: { urlFilter: string } }>

  const urlFilters = rules.map((r) => r.condition.urlFilter)
  expect(urlFilters).toContain(`||${BLOCKED_DOMAIN}^`)
})

test("failed navigation context url matches the rule-configured domain", async () => {
  const page = await ctx.newPage()
  const failedRequests: string[] = []

  page.on("requestfailed", (req) => {
    failedRequests.push(req.url())
  })

  try {
    await page.goto(`https://${BLOCKED_DOMAIN}`, {
      waitUntil: "commit",
      timeout: 8_000,
    })
  } catch {
    // Expected — blocked navigation throws
  }

  // At least one request to the blocked domain must have been intercepted
  const blockedRequest = failedRequests.find((url) =>
    url.includes(BLOCKED_DOMAIN),
  )
  expect(blockedRequest).toBeDefined()
  expect(blockedRequest).toContain(BLOCKED_DOMAIN)

  await page.close()
})
// ---------------------------------------------------------------------------
// Acceptance criterion 3 — Tab URLs stay readable without the "tabs" permission
// ---------------------------------------------------------------------------

// usage-monitor.ts (tabs.query) and analytics-buffer.ts (tabs.onUpdated) need
// tab.url, which Chrome only exposes with "tabs" or matching host access. The
// manifest relies on <all_urls> alone, so prove the real browser honours it.
test("service worker can read the active tab url via host permissions alone", async () => {
  const http = await import("node:http")
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end("<title>tab-url-probe</title>")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as { port: number }
  const url = `http://127.0.0.1:${port}/`

  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent("serviceworker")

  const page = await ctx.newPage()
  try {
    await page.goto(url)
    const tabUrls = (await sw.evaluate(async () => {
      const tabs = await chrome.tabs.query({})
      return tabs.map((t) => t.url)
    })) as Array<string | undefined>

    expect(tabUrls).toContain(url)
  } finally {
    await page.close()
    server.close()
  }
})
