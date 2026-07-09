# Block Lock — Chrome Web Store Pre-Launch Checklist

## 1. Production deployment — confirm the details, not just "is it up"

Deployment itself is done. Still worth confirming these before submitting:

- [ ] Google OAuth consent screen is out of "Testing" mode (or all real users are added as test users) — otherwise strangers installing the extension can't log in
- [ ] Prod Google OAuth redirect URI (`https://blocklock.app/api/auth/callback/google`) is registered in Google Cloud Console
- [ ] `NEXT_PUBLIC_EXTENSION_ID` is actually set in the Vercel prod env (see #2 — easy to deploy the app before this exists, then forget to circle back)

## 2. The extension-ID chicken-and-egg problem (specific to this repo)

`lib/cors.ts` only allows requests from `chrome-extension://${NEXT_PUBLIC_EXTENSION_ID}` — a single hardcoded origin. Chrome assigns that ID the first time you upload a package, so you don't know it up front.

- [ ] Upload an initial (unpublished/draft) build to the CWS dashboard to get the permanent extension ID — or bake a fixed `key` into `manifest.json` beforehand to pin the ID
- [ ] Set `NEXT_PUBLIC_EXTENSION_ID` in prod to that ID and redeploy **before** submitting for review, or every real user's `/api/sync` and `/api/analytics` calls will 403
- [ ] Double check `externally_connectable.matches` in `manifest.json` points at `https://blocklock.app/*` (already confirmed live) and not a stale localhost/staging entry

## 3. Extension packaging gaps

- [ ] **No icons exist anywhere.** `manifest.json` has no `"icons"` key and there's no 16/48/128px PNG in the repo — CWS requires at least a 128×128 for the listing, and Chrome shows a generic puzzle icon without one. The shield mark is already inlined as SVG in `popup.tsx` — export that at 16/48/128 and wire it into the manifest.
- [ ] Bump `"version"` off `0.1.0` and settle on a versioning scheme (every future update needs to strictly increase it)
- [ ] Run the real build (`pnpm --filter @block-lock/extension build`) and load `dist/block-lock-extension-*.zip` unpacked in a clean Chrome profile
- [ ] Manually walk the full flow against the **real** prod deployment once: install → popup "Not Connected" → click through to blocklock.app, log in → popup flips to "Connected" → add a rule → confirm the site is actually blocked → confirm analytics hit `/api/analytics`

## 4. Permissions you'll have to justify to reviewers

CWS requires a free-text justification per permission in the dashboard:

- [ ] `host_permissions: <all_urls>` + `tabs` together — this combo gets extra manual review scrutiny, budget more time (weeks, not days)
- [ ] `declarativeNetRequest` / `declarativeNetRequestFeedback` (blocking), `alarms` (analytics flush), `storage` (local session)

## 5. Privacy & data disclosure — confirmed still missing

`blocklock.app/privacy` currently 404s. The extension logs every domain you visit and time-on-site (`analytics-buffer.ts`) and ships it to your live backend — this is a hard requirement, not optional.

- [ ] Write and publish a public privacy policy page (e.g. `apps/web/app/privacy/page.tsx`) — required since you're collecting browsing history + a user id
- [ ] Complete CWS's "Privacy practices" data-usage form: declare "User activity/browsing history" collected, link the policy, certify no data sale
- [ ] Consider whether you need a delete-my-data action — there's currently no way for a user to purge their `UsageLog` rows

## 6. Store listing & account

- [ ] $5 one-time CWS developer registration
- [ ] 128×128 icon, ≥1 screenshot (1280×800 or 640×400) — grab these from the **live** dashboard now that it's deployed, not mockups
- [ ] Short + full description, category (Productivity), support email, single-purpose description matching the permissions

## 7. Final pass

- [ ] `test` / `test:e2e` / `lint` green on the exact commit you package
- [ ] MIT `LICENSE` — confirm you're fine shipping this publicly as-is

---

**Most likely rejection reason:** given the permission shape (`<all_urls>` + `tabs` + browsing-history-style analytics), the missing privacy policy is the top risk — that's a hard blocker for submission, not just a nice-to-have, since `/privacy` 404s right now.
