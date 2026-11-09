import { test, expect } from "./fixtures";

// ---------------------------------------------------------------------------
// Chromium profile loads the built extension
// ---------------------------------------------------------------------------

test("background service worker registers when the extension loads", async ({
  serviceWorker,
}) => {
  expect(serviceWorker.url()).toContain("background.js");
});

// ---------------------------------------------------------------------------
// Tab URLs stay readable without the "tabs" permission
// ---------------------------------------------------------------------------

// usage-monitor.ts (tabs.query) and analytics-buffer.ts (tabs.onUpdated) need
// tab.url, which Chrome only exposes with "tabs" or matching host access. The
// manifest relies on <all_urls> alone, so prove the real browser honours it.
test("service worker can read the active tab url via host permissions alone", async ({
  extensionContext: context,
  serviceWorker,
}) => {
  const http = await import("node:http");
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<title>tab-url-probe</title>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}/`;

  const page = await context.newPage();
  try {
    await page.goto(url);
    const tabUrls = (await serviceWorker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      return tabs.map((t) => t.url);
    })) as Array<string | undefined>;

    expect(tabUrls).toContain(url);
  } finally {
    await page.close();
    server.close();
  }
});
