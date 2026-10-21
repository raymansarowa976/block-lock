# Block Lock — Pre-Submission Testing Plan

**Target:** submit extension v0.1.0 to the Chrome Web Store on **Thu Nov 6, 2026**.
Store review usually takes 1–3 weeks, so expect to go live late November.

Deployment and setup are done. The code fixes below are still open on `dev` and `main`.

| When | Phase |
|---|---|
| Oct 21–23 | Phase 1: fix the known bugs (test-first) |
| Oct 26–30 | Phase 2: manual testing against production |
| Nov 2–5 | Phase 3: private beta and real store ID |
| Nov 6 | Phase 4: final check and submit |

---

## Phase 1: Fix the known bugs (Oct 21–23)

Write a failing test first, then fix. Add an E2E case to `services/extension/e2e/enforcement.spec.ts` where it makes sense.

### Must fix before submitting

- [ ] **1. Sync stops after the dashboard closes.** The sync token lasts 15 min (`apps/web/lib/sync-token.ts`) and is only refreshed while a dashboard tab is open (`apps/web/components/extension-bridge.tsx`). About 15 min after the user closes the dashboard, the popup shows "session expired" and rule changes stop syncing. Blocking keeps using the last rules it saved. The extension needs a longer-lived credential (e.g. a revocable refresh token) or a way to renew its own token.
- [ ] **2. Overnight schedules never block.** `services/extension/src/schedule-window.ts` checks `start <= now < end`, so a window like 22:00–06:00 never matches. Nothing in the shared types or the schedule form rejects it. Either support windows that cross midnight or reject end ≤ start in the schema and the form.
- [ ] **3. `localhost:3000` ships in the store build.** It appears in `manifest.json` (`externally_connectable`) and `ALLOWED_ORIGINS` in `src/auth-handler.ts`. Remove it from production builds (e.g. change the manifest in the Vite `copy-manifest` plugin based on `mode`). Add a check to `test:artifacts` that fails if `localhost` is in the zip.

### Fix if time allows (otherwise ship as known issues in 0.1.1)

- [ ] **4. Daily limits over-count.** `src/usage-monitor.ts` counts a minute for the active tab of the last-focused window even when Chrome isn't focused or the user is away. Check that a Chrome window is focused, and consider the `idle` permission. Adding a permission is a major version change per RELEASING.md, so weigh this one.
- [ ] **5. Analytics lose data.** `src/analytics-buffer.ts` keeps open tabs in an in-memory `Map`, which is cleared whenever Chrome shuts down the idle service worker (~30 s). Tab closes and tab switches aren't recorded, and time in background tabs is counted. Store the open-tab state in `chrome.storage.session` and listen to `tabs.onActivated` / `tabs.onRemoved`.
- [ ] **6. The sync token is sent in the URL.** `?token=` on `/api/sync` and `/api/sync/revoke` ends up in server and proxy logs. Send it in an `Authorization: Bearer` header and update both API routes.

### At launch (after the store assigns the ID — see Phase 3)

- [ ] **7. The extension ID will change.** The store ID differs from the unpacked one. `NEXT_PUBLIC_EXTENSION_ID` in production must match it, or the dashboard can't reach the extension and nobody can sign in.

### End of Phase 1: run everything

```bash
pnpm lint && pnpm test:coverage
pnpm --filter @block-lock/extension test:e2e
pnpm --filter @block-lock/extension build
pnpm --filter @block-lock/extension test:artifacts
```

---

## Phase 2: Manual testing against production (Oct 26–30)

Load `services/extension/dist/` unpacked in `chrome://extensions`, pointed at `https://blocklock.app`.
For each bug: write it down with the steps, the expected and actual result, and the popup state. Fix it test-first and test it again.

### Install and sign-in
- [ ] Fresh install, no account: the popup sends you to sign in
- [ ] Sign in through the dashboard: the popup shows "Connected" and the rules sync
- [ ] Close the dashboard and wait 20+ min: sync keeps working (bug 1)
- [ ] Disconnect from the popup: local state is cleared and the token is revoked
- [ ] Sign out of the dashboard, then sign in as a different Google account: no rules carry over

### Blocking
- [ ] A permanently blocked domain redirects to the blocked page from the address bar, from a link, and in a new tab
- [ ] Domain input variants: `www.`, subdomains (`m.reddit.com`), uppercase, a pasted full URL
- [ ] Embedded content (iframes, fetch requests) is **not** blocked, as documented in the README
- [ ] A schedule starts and lifts within ~1 min of its start and end times
- [ ] A schedule doesn't block on days it isn't set for
- [ ] Overnight schedule (e.g. 22:00–06:00) works or is rejected (bug 2)
- [ ] Daily limit blocks once reached
- [ ] Daily limit resets at local midnight, including with Chrome left open over midnight
- [ ] Daily limit after a system timezone change
- [ ] Daily limit doesn't count time when Chrome is in the background or minimized (bug 4)
- [ ] A rule can't be weakened from the dashboard while hard lock is on
- [ ] Rule changes reach the extension right away while the dashboard is open, and within ≤5 min otherwise

### Things that go wrong in real use
- [ ] Restart Chrome: rules still apply, and the timers in `chrome://extensions` → service worker → alarms come back
- [ ] Restart the computer, and wake it from sleep
- [ ] Go offline: the popup shows a network error. Back online: it recovers by itself (retries at 30 s → 1 m → 2 m → 4 m)
- [ ] Backend returns 500 or is slow: blocking keeps working from the saved rules
- [ ] Leave the service worker idle for 5+ min (`chrome://serviceworker-internals`), then browse: usage and analytics are still recorded (bug 5)
- [ ] Incognito: decide whether it's supported, then test that choice
- [ ] Load: 50+ rules, long domains, unicode domains (e.g. `bücher.de`)
- [ ] Update path: install 0.1.0, then load a fake 0.1.1 over it — settings and rules are kept

### Browsers and operating systems
- [ ] Chrome stable on Windows
- [ ] One other Chromium browser (Edge or Brave)
- [ ] macOS or ChromeOS if available

### Dashboard (web app)
- [ ] Analytics charts with no data, 1 day of data, and 30+ days of data
- [ ] AI schedule and classification features when the AI provider is down or times out
- [ ] "Delete account" in the danger zone really removes all user data (the store's privacy rules require this)
- [ ] Phone-width layout, keyboard-only navigation, light and dark themes
- [ ] The privacy page at `/privacy` is public and accurately lists what data is collected

---

## Phase 3: Private beta (Nov 2–5)

- [ ] Upload the build as a **Private** or **Unlisted** listing in the Chrome Web Store dashboard
- [ ] Note the store-assigned extension ID and set `NEXT_PUBLIC_EXTENSION_ID` in Vercel production. Redeploy (bug 7)
- [ ] Install from the store and confirm sign-in works with the real ID
- [ ] Invite 3–5 trusted testers. Ask them to send bug reports with the time, popup state and steps
- [ ] Use it daily yourself
- [ ] Fix only crashes and blockers. Anything else goes under `## [Unreleased]` for 0.1.1
- [ ] Run the whole Phase 2 checklist again on the final build

---

## Phase 4: Final check and submit (Nov 6)

### Release steps (from `services/extension/RELEASING.md`)
- [ ] **Merge `dev` into `main` first.** `main` is behind `dev` and doesn't have the sync retry and popup sync changes
- [ ] RELEASING.md says to branch from `main`. Make sure that matches your real flow, or update the doc
- [ ] Update the date of the `## [0.1.0]` entry in `CHANGELOG.md` to the submission date
- [ ] `pnpm --filter @block-lock/extension test` and `test:e2e`
- [ ] `pnpm --filter @block-lock/extension build` → `dist/block-lock-extension-0.1.0.zip`
- [ ] `pnpm --filter @block-lock/extension test:artifacts`
- [ ] Tag `extension-v0.1.0` and push the tag
- [ ] Build from the tag and upload the zip

### Store listing
- [ ] **Single purpose:** "Blocks distracting sites on user-defined schedules and daily time limits."
- [ ] **Permission explanations:**
  - `declarativeNetRequest`: blocks and redirects the sites the user chose to block
  - `storage`: stores synced rules and daily usage on the device
  - `alarms`: re-checks schedule windows and daily limits every minute, and syncs rules every 5 min
  - `<all_urls>` (expect the closest look at this one): reads the active tab's domain to measure daily limits, and redirects any site the user blocks to the blocked page
- [ ] **Privacy practices:** say that you collect **web history / user activity** (domains visited and time on site, sent to the Block Lock server). Confirm you don't sell or transfer the data. Certify Limited Use compliance
- [ ] **Privacy policy URL:** `https://blocklock.app/privacy`
- [ ] **Assets:** 128×128 icon, at least one 1280×800 screenshot (popup, blocked page, dashboard), 440×280 small promo tile
- [ ] **Description:** covers only what the extension itself does. AI features belong to the web app (per RELEASING.md)
- [ ] Submit for review

### After submitting
- Plan for one possible rejection. If rejected, fix it and upload again with the **same** version (0.1.0 was never published)
- Once approved: create a GitHub release from the `extension-v0.1.0` tag, using the changelog entry as its notes
- Watch the first few days of real users for sync errors and sign-in failures
- Ship bugs 4–6 (if deferred) in **0.1.1**
