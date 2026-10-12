import { test, expect, getUrlFilters, resetExtensionState } from "./fixtures";
import type { Worker } from "@playwright/test";

// End-to-end coverage of the extension's own blocking decisions: rules,
// schedules and usage are seeded into chrome.storage exactly as syncRules /
// the usage tracker would leave them, then the real "usage-tick" alarm fires
// handleUsageTick -> applyBlockRules inside the built service worker. Nothing
// here injects declarativeNetRequest rules by hand.
test.describe.configure({ mode: "serial" });

const DOMAIN = "example.org";
const FILTER = `||${DOMAIN}^`;
const USER_ID = "clh3q5g0o0000qmij2z3m4n5k";
const LIMIT_ID = "clh3q5g0o0001qmij2z3m4n5k";
const SCHEDULE_ID = "clh3q5g0o0002qmij2z3m4n5k";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type Seed = {
  dailyLimit: number | null;
  // "today" / "other-days" are resolved inside the browser so they follow the
  // service worker's clock and timezone, not the test runner's.
  schedule?: "today" | "other-days";
  minutesUsed?: number;
  usageDate?: "today" | "yesterday";
};

async function seed(sw: Worker, s: Seed): Promise<void> {
  await sw.evaluate(
    async ({ s, ids, domain, allDays }) => {
      const now = new Date();
      const dateKey = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const ts = now.toISOString();

      const rules = [
        {
          id: ids.limit,
          userId: ids.user,
          domain,
          dailyLimit: s.dailyLimit,
          isActive: true,
          createdAt: ts,
          updatedAt: ts,
        },
      ];

      const schedules = s.schedule
        ? [
            {
              id: ids.schedule,
              timeLimitId: ids.limit,
              startTime: "00:00",
              endTime: "23:59",
              daysOfWeek:
                s.schedule === "today"
                  ? [now.getDay()]
                  : allDays.filter((d: number) => d !== now.getDay()),
              createdAt: ts,
              updatedAt: ts,
            },
          ]
        : [];

      const items: Record<string, unknown> = { rules, schedules };
      if (s.minutesUsed !== undefined) {
        const day = new Date(now);
        if (s.usageDate === "yesterday") day.setDate(day.getDate() - 1);
        items.dailyUsage = {
          [domain]: { date: dateKey(day), minutesUsed: s.minutesUsed },
        };
      }
      await chrome.storage.local.set(items);
    },
    {
      s,
      ids: { user: USER_ID, limit: LIMIT_ID, schedule: SCHEDULE_ID },
      domain: DOMAIN,
      allDays: ALL_DAYS,
    }
  );
}

// Fires the extension's real usage-tick alarm and waits until applyBlockRules
// has finished (it stamps lastSync last), so "no rule" means the engine
// decided not to block — not that it hasn't run yet.
async function runUsageTick(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    await chrome.storage.local.remove("lastSync");
    // Unpacked extensions aren't subject to the 30s alarm minimum.
    await chrome.alarms.create("usage-tick", { when: Date.now() });
  });
  await expect
    .poll(
      () =>
        sw.evaluate(
          async () => (await chrome.storage.local.get("lastSync")).lastSync
        ),
      { timeout: 10_000 }
    )
    .toBeTruthy();
}

// The seeded schedule windows run 00:00–23:59 on whole days; avoid the one
// minute where "today" can roll over between seeding and the tick.
test.beforeEach(async ({ serviceWorker }) => {
  const nearMidnight = await serviceWorker.evaluate(() => {
    const n = new Date();
    return n.getHours() === 23 && n.getMinutes() >= 58;
  });
  test.skip(
    nearMidnight,
    "schedule windows are day-granular; skip across midnight"
  );
  await resetExtensionState(serviceWorker);
});

test.afterAll(async ({ serviceWorker }) => {
  await resetExtensionState(serviceWorker);
});

// ---------------------------------------------------------------------------
// Unconditional rules
// ---------------------------------------------------------------------------

test("a rule with no daily limit and no schedule is always blocked", async ({
  serviceWorker,
}) => {
  await seed(serviceWorker, { dailyLimit: null });
  await runUsageTick(serviceWorker);
  expect(await getUrlFilters(serviceWorker)).toContain(FILTER);
});

// ---------------------------------------------------------------------------
// Schedule-window enforcement
// ---------------------------------------------------------------------------

test.describe("schedule window", () => {
  test("blocks while now is inside the rule's schedule", async ({
    serviceWorker,
  }) => {
    await seed(serviceWorker, { dailyLimit: null, schedule: "today" });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).toContain(FILTER);
  });

  test("does not block on a day outside the rule's schedule", async ({
    serviceWorker,
  }) => {
    await seed(serviceWorker, { dailyLimit: null, schedule: "other-days" });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).not.toContain(FILTER);
  });

  test("lifts an active block on the next tick once the window no longer applies", async ({
    serviceWorker,
  }) => {
    await seed(serviceWorker, { dailyLimit: null, schedule: "today" });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).toContain(FILTER);

    await seed(serviceWorker, { dailyLimit: null, schedule: "other-days" });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).not.toContain(FILTER);
  });
});

// ---------------------------------------------------------------------------
// Daily-limit enforcement
// ---------------------------------------------------------------------------

test.describe("daily limit", () => {
  test("leaves the domain reachable while today's usage is under the limit", async ({
    serviceWorker,
  }) => {
    await seed(serviceWorker, { dailyLimit: 30, minutesUsed: 29 });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).not.toContain(FILTER);
  });

  test("blocks once today's usage reaches the limit", async ({
    serviceWorker,
  }) => {
    await seed(serviceWorker, { dailyLimit: 30, minutesUsed: 30 });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).toContain(FILTER);
  });

  test("treats yesterday's exhausted budget as reset", async ({
    serviceWorker,
  }) => {
    await seed(serviceWorker, {
      dailyLimit: 30,
      minutesUsed: 90,
      usageDate: "yesterday",
    });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).not.toContain(FILTER);
  });

  test("does not block outside the schedule even when the budget is exhausted", async ({
    serviceWorker,
  }) => {
    await seed(serviceWorker, {
      dailyLimit: 30,
      minutesUsed: 30,
      schedule: "other-days",
    });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).not.toContain(FILTER);
  });

  test("blocks inside the schedule once the budget is exhausted", async ({
    serviceWorker,
  }) => {
    await seed(serviceWorker, {
      dailyLimit: 30,
      minutesUsed: 30,
      schedule: "today",
    });
    await runUsageTick(serviceWorker);
    expect(await getUrlFilters(serviceWorker)).toContain(FILTER);
  });
});

// ---------------------------------------------------------------------------
// What the user actually sees
// ---------------------------------------------------------------------------

test("navigating to an engine-blocked domain lands on the extension's blocked page", async ({
  extensionContext: context,
  serviceWorker,
}) => {
  await seed(serviceWorker, { dailyLimit: null });
  await runUsageTick(serviceWorker);

  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  try {
    await page.goto(`https://${DOMAIN}/some/path`, {
      waitUntil: "commit",
      timeout: 8_000,
    });
    await expect(page).toHaveURL(
      `chrome-extension://${extensionId}/blocked.html?domain=${DOMAIN}`
    );
  } finally {
    await page.close();
  }
});
