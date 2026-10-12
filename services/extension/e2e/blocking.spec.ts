import { test, expect, getUrlFilters, resetExtensionState } from "./fixtures";

const BLOCKED_DOMAIN = "example.com";

// These specs prove Chromium's declarativeNetRequest honours the rule shape
// the extension uses, by injecting a rule directly. For the extension's own
// decision of *when* to emit that rule, see enforcement.spec.ts.
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ serviceWorker }) => {
  await resetExtensionState(serviceWorker);
});

// ---------------------------------------------------------------------------
// Blocked domain navigation is intercepted
// ---------------------------------------------------------------------------

test("navigation to a blocked domain fails with a network error", async ({
  extensionContext: context,
  serviceWorker,
}) => {
  // Inject a blocking rule directly into the extension's declarativeNetRequest
  await serviceWorker.evaluate(async (domain: string) => {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "block" as chrome.declarativeNetRequest.RuleActionType,
          },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: [
              "main_frame" as chrome.declarativeNetRequest.ResourceType,
            ],
          },
        },
      ],
    });
  }, BLOCKED_DOMAIN);

  const page = await context.newPage();
  let navigationError: Error | null = null;

  try {
    await page.goto(`https://${BLOCKED_DOMAIN}`, {
      waitUntil: "commit",
      timeout: 8_000,
    });
  } catch (err) {
    navigationError = err as Error;
  }

  expect(navigationError).not.toBeNull();
  expect(navigationError!.message).toMatch(
    /ERR_BLOCKED_BY_CLIENT|ERR_ABORTED|net::ERR/
  );

  await page.close();
});

// ---------------------------------------------------------------------------
// Active rules match the configured domain
// ---------------------------------------------------------------------------

test("active declarativeNetRequest rules contain the blocked domain filter", async ({
  serviceWorker,
}) => {
  expect(await getUrlFilters(serviceWorker)).toContain(`||${BLOCKED_DOMAIN}^`);
});

test("failed navigation context url matches the rule-configured domain", async ({
  extensionContext: context,
}) => {
  const page = await context.newPage();
  const failedRequests: string[] = [];

  page.on("requestfailed", (req) => {
    failedRequests.push(req.url());
  });

  try {
    await page.goto(`https://${BLOCKED_DOMAIN}`, {
      waitUntil: "commit",
      timeout: 8_000,
    });
  } catch {
    // Expected — blocked navigation throws
  }

  // At least one request to the blocked domain must have been intercepted
  const blockedRequest = failedRequests.find((url) =>
    url.includes(BLOCKED_DOMAIN)
  );
  expect(blockedRequest).toBeDefined();
  expect(blockedRequest).toContain(BLOCKED_DOMAIN);

  await page.close();
});
