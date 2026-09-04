# Block Lock — Issue Checklist

Source: critical review of `services/extension`, `apps/web`, and
`packages/shared-types`. Each top-level item below is scoped to be pasted
as a single GitHub issue (title bolded, body underneath, acceptance
criteria as sub-checkboxes). Ordered by priority — P0 blocks the product
working at all, P1 blocks a safe/real launch, P2 blocks Chrome Web Store
submission, P3 is architecture/cost cleanup, P4 is smaller hardening.

---

## P0 — Product doesn't do what it claims

- [ ] **Extension never enforces `dailyLimit` (time budgets)**
  - `services/extension/src/rule-engine.ts` only filters `payload.rules` by `isActive`; `dailyLimit` is read nowhere except display text in `blocked-page.tsx`.
  - No counter exists anywhere for minutes-used per domain per day, no reset-at-midnight, no re-block-on-budget-exhausted.
  - Acceptance: a domain with `dailyLimit: 20` is reachable for ~20 min/day, then blocked until the next day, without a manual sync.

- [ ] **Extension never enforces schedules (time-of-day windows)**
  - `payload.schedules` is fetched by `syncRules()` in `auth-handler.ts` but never read by `rule-engine.ts`. Server-side, `/api/sync` returns raw `TimeLimit` rows with no schedule-window filtering either.
  - Result: a domain scheduled "weekdays 9–17" is blocked 24/7 the instant `isActive` is true, or not blocked at all — schedules currently have zero effect on real browsing.
  - Acceptance: decide where "is this domain in-window right now" gets computed (service-worker `chrome.alarms` tick vs. server-computed at `/sync` time), then implement it so blocking actually turns on/off at the scheduled boundaries.

---

## P1 — Security: extension↔server auth is spoofable / broken

- [ ] **`/api/sync` has no authentication — public IDOR on every user's block list**
  - `apps/web/app/api/sync/route.ts` never calls `auth()`; it trusts `?userId=<cuid>` as-is and returns that user's `TimeLimit`s + `Schedule`s.
  - CORS restricts *browser* callers to the extension's origin, but does nothing to stop a direct `curl https://blocklock.app/api/sync?userId=<any-cuid>`.
  - `userId` is a bare Prisma `cuid` handed to the extension once via `BLOCK_LOCK_AUTH` (`apps/web/components/extension-bridge.tsx`) and stored forever — it is not a session token and can't be revoked short of deleting the account.
  - Acceptance: replace the bare `userId` credential with a signed/short-lived token minted from an authenticated dashboard session; verify it server-side on `/api/sync`; add an expiry + refresh path that actually drives the existing `authError: "session_expired"` popup state.

- [ ] **`/api/analytics` requires a session cookie the extension can never send — analytics pipeline is dead**
  - `apps/web/app/api/analytics/route.ts` requires `await auth()` to succeed (cookie-based session).
  - `services/extension/src/analytics-flush.ts` posts with a plain `fetch(...)`, no `credentials: "include"`, and even with it, a `chrome-extension://` service-worker fetch to `blocklock.app` is cross-site so the session cookie is never attached.
  - Every flush will 401. The README's "analytics pipeline streams browsing durations from the extension to the dashboard" does not currently function end-to-end.
  - Acceptance: use the same token scheme as `/api/sync` for `/api/analytics`; confirm with a real logged-in build that a flush round-trips and rows land in `UsageLog`.

- [ ] **No server-side sign-out / credential revocation**
  - `BLOCK_LOCK_SIGNOUT` only clears local `chrome.storage.local` state; there's no server-side invalidation of whatever credential the extension is holding.
  - Acceptance: once P1's token scheme lands, signing out on the dashboard (or from the extension) should invalidate that specific token server-side, not just forget it locally.

---

## P1 — Security: no rate limiting on the only public-facing endpoints

- [ ] **Add rate limiting to `/api/sync` and `/api/analytics`**
  - `apps/web/lib/rate-limit.ts` is already applied to `/api/ai/schedule`, `/api/classify`, `/api/usage` — but not to `/sync` or `/analytics`, which are exactly the two endpoints reachable without a valid session today.
  - A `/sync` cache miss does a Prisma read *and* an Upstash write keyed by attacker-controlled `userId` — cheap to abuse into real Postgres load and real Upstash bill (pay-per-request pricing).
  - Acceptance: both routes reject excessive requests per IP/token the same way the AI routes do.

---

## P2 — Not submittable to the Chrome Web Store

- [ ] **Add extension icons**
  - `manifest.json` has no `icons` key; no icon assets exist under `services/extension/`. Submission is not possible without them.

- [ ] **Write and publish a privacy policy**
  - The extension collects browsing domains + time-on-site and ships them server-side (`UsageLog`). This is Chrome Web Store "User Data" policy territory — a privacy policy URL is mandatory in the listing, and there's currently no privacy policy page anywhere in `apps/web/app`.

- [ ] **Re-justify or narrow `host_permissions: ["<all_urls>"]` + `"tabs"`**
  - This combination puts the listing in the highest review-scrutiny bucket (typically requires a written justification + demo video).
  - Check whether `"tabs"` is even needed: `analytics-buffer.ts` only reads `changeInfo.url` off `chrome.tabs.onUpdated`, which matched hosts can already provide under `host_permissions` alone in MV3. Dropping `"tabs"` narrows the ask.

- [ ] **Get a real deployment live before submitting**
  - `externally_connectable` points at `https://blocklock.app`, but the README says the project "is not yet live." Reviewers will exercise "Connect your account" in the popup and need a working backend.

- [ ] **Tighten single-purpose listing copy**
  - Manifest description says "Enforce focus by blocking distracting sites," but the backend also does AI natural-language scheduling (`/api/ai/schedule`), embedding-based domain classification (`/api/classify`), and an AI "productivity coach" (`/api/cron/insights`). None of it runs client-side (good) — just make sure store copy doesn't overclaim AI features that live entirely server-side, and that the extension reads as doing one clear thing.

- [ ] **Establish a real release/versioning process before shipping updates**
  - Currently `0.1.0`, no changelog discipline. `scripts/zip-dist.mjs` is a fine build step to build on. Every store update needs a version bump and gets re-reviewed — worth a documented process before the first submission.

---

## P3 — Architecture is heavier than the product needs

- [ ] **Reconsider running Postgres + Prisma + Redis (Upstash) + pgvector + OpenAI + Vercel Cron + Auth.js pre-launch**
  - That's a lot of paid, operable infrastructure for a product with zero deployed users. Each piece is something that can go down, cost money, or need a migration.

- [ ] **Shelve the AI features until P0/P1 are solid**
  - `/api/ai/schedule` (NL parsing), `/api/classify` (embedding-based classification), `/api/cron/insights` (weekly AI briefings) are the most speculative, least-validated part of the product and the most exposed to OpenAI cost overruns from a public-facing extension. They're extra attack surface and review surface in service of a feature set that isn't the core value yet.

- [ ] **Pick one deploy target, not two**
  - Both a `Dockerfile`/`docker-compose.yml` path and a Vercel path exist. Keep Vercel as primary (per README) and only keep Docker if it's actually used for local dev parity — otherwise it's duplicate maintenance this early.

---

## P4 — Smaller hardening / correctness

- [ ] **Make `declarativeNetRequest` rule IDs stable**
  - `rule-engine.ts` assigns `id: index + 1` on every rebuild. Works today (paired with `removeRuleIds: existingIds` in the same call) but will collide the moment a second kind of dynamic rule is introduced (e.g. a temporary "unblock for 5 min" override). Namespace or hash-derive IDs instead.

- [ ] **De-duplicate domain-parsing logic**
  - `services/extension/src/sanitise-domain.ts` and the `Domain` zod regex in `packages/shared-types/src/index.ts` are two independent implementations of the same validation, neither handling IDNs/punycode consistently. Since domain matching is the actual product, a divergence here is a silent blocking bug. Have the extension import the shared schema; add tests for `co.uk`-style multi-part TLDs, IDNs, and IP-literal hosts.

- [ ] **Decide and document the `MAIN_FRAME`-only blocking scope**
  - Current rules only match `resourceTypes: [MAIN_FRAME]`, so an embedded iframe or `fetch`/`XHR` to a blocked domain from an allowed page isn't blocked. May be intentional — document it either way as a stated limitation.

- [ ] **Add a local sign-out/disconnect affordance in the popup**
  - `BLOCK_LOCK_SIGNOUT` exists as a message type but nothing in `popup.tsx` ever sends it. Confirm the dashboard→extension sign-out round-trip actually works, and add a fallback "disconnect" button in the popup for when the dashboard is unreachable.

- [ ] **Close test gaps around the highest-risk code paths**
  - No test exercises `/api/sync` with a missing/invalid session (arguably because there's currently no session check to test — see P1). No test asserts schedule-window or daily-limit enforcement (because it doesn't exist yet — see P0). E2E suite (`services/extension/e2e/extension.spec.ts`) is a single file. Per this project's TDD workflow: write the failing tests for P0/P1 items first, then implement against them.

---
