import { test as base, chromium } from "@playwright/test";
import path from "path";
import type { BrowserContext, Worker } from "@playwright/test";

const EXTENSION_PATH = path.join(__dirname, "../dist");

type WorkerFixtures = {
  extensionContext: BrowserContext;
  serviceWorker: Worker;
};

// One persistent Chromium profile with the built extension loaded, shared by
// every spec in the worker (playwright.config.ts pins workers: 1). Specs that
// mutate extension state must reset it themselves — see resetExtensionState.
export const test = base.extend<object, WorkerFixtures>({
  extensionContext: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const ctx = await chromium.launchPersistentContext("", {
        // headless: false is required; Chrome extensions are not supported in
        // the legacy headless mode. --headless=new keeps it windowless.
        headless: false,
        args: [
          "--headless=new",
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
        ],
      });
      await use(ctx);
      await ctx.close();
    },
    { scope: "worker" },
  ],
  serviceWorker: [
    async ({ extensionContext: context }, use) => {
      // The service worker may still be starting; wait for it if needed
      let [sw] = context.serviceWorkers();
      if (!sw) sw = await context.waitForEvent("serviceworker");
      await use(sw);
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";

// Wipes everything the extension persists so a spec starts from a clean,
// signed-out install: no token (so syncRules is a no-op), no rules, no usage,
// and no dynamic blocking rules.
export async function resetExtensionState(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    await chrome.storage.local.clear();
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
    });
  });
}

export async function getUrlFilters(sw: Worker): Promise<string[]> {
  const rules = (await sw.evaluate(() =>
    chrome.declarativeNetRequest.getDynamicRules()
  )) as Array<{ condition: { urlFilter?: string } }>;
  return rules.map((r) => r.condition.urlFilter ?? "");
}
