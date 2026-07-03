# block-lock: QA Bug Tracking & Verification Report

## High-Priority Regressions & Infrastructure Issues

### 1. Extension Handshake Desynchronization
* **Bug Description:** The browser extension fails to re-sync state updates with the active Chrome runtime environment.
* **Impact:** High. Block profiles and modifications do not pull through to the local browser thread dynamically without forcing a full extension lifecycle reboot.
* **Remedial Action Tasks:**
    * [x] Audit the service worker state synchronization pipeline inside `services/extension`.
    * [x] Force an extension-side listener hook using `chrome.runtime.onMessage` to explicitly intercept cache eviction broadcasts.
* **Verification Pass criteria:**
    * [x] [TEST] Verify that changing a rule on the local environment pushes a sync broadcast to the extension background script within 200ms.

### 2. Environment Parity (Vercel Deployment Routing)
* **Bug Description:** Extension builds are locked to local loopback addresses (`localhost`), preventing connection to the production deployed version of the application platform.
* **Impact:** High. Real-world users installing the extension artifact are completely unauthenticated and isolated from the live backend server matrix.
* **Remedial Action Tasks:**
    * [x] Abstract the API base URL parameter using an environment variable wrapper (`NEXT_PUBLIC_APP_URL`).
    * [x] Inject dynamic production cross-origin headers (CORS) allowing `chrome-extension://` origins to securely execute fetch queries against the `blocklock.app` domain wrapper.
* **Verification Pass criteria:**
    * [x] [TEST] Verify that a production extension package correctly handles authentication handshakes against the deployed production API tier without throwing CORS security blocks.

---

## Performance Bottlenecks & UX Glitches

### 3. Blocking Engine Thread Lag (Stale State Renderings)
* **Bug Description:** Adding or removing restricted domain rules responds with severe latency delays; mutations do not show up immediately on the dashboard UI unless the user manually forces a hard browser page reload.
* **Impact:** Medium. Breaks fluid UX flow and creates an illusion that the application backend didn't register the action.
* **Remedial Action Tasks:**
    * [ ] Refactor the domain submission form to employ React `useOptimistic` hooks.
    * [ ] Ensure the Next.js Server Action triggers an instantaneous client-side router cache revalidation (`revalidatePath("/dashboard")`) immediately following database writes.
* **Verification Pass criteria:**
    * [ ] [TEST] Assert that adding a domain increments the visible active rules list count smoothly within 0ms client-side execution latency.

### 4. Broken Exception Interceptions (Unpause Relapse Fallouts)
* **Bug Description:** Triggering an unpause mutation on an active blocked profile throws an unhandled "An unexpected error occurred" toast exception error card directly on the UI workspace.
* **Impact:** Medium. Prevents normal interactive modification patterns over existing database entry states.
* **Remedial Action Tasks:**
    * [ ] Wrap the unpause/resume transactional toggles in an explicit Prisma save try/catch operation block.
    * [ ] Verify the target entity model attributes match required state properties before dispatching the database mutation payload.
* **Verification Pass criteria:**
    * [ ] [TEST] Click the unpause action switch button repeatedly on an active rule card to ensure zero validation alerts or generic error cards pop up into view.

---

## Scheduling & Domain Business Logic Flaws

### 5. Clunky Schedule Input Workflows
* **Bug Description:** Manually typing chronological start and end times (`03:44-16:45`) via text
