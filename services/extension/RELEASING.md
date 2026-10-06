# Releasing the Chrome extension

Every Chrome Web Store upload is reviewed again and must carry a version higher than the one already
published. This process makes sure each upload has a deliberate version number and a written record
of what changed.

## Where the version lives

| File | Role |
|---|---|
| `manifest.json` → `version` | What Chrome and the store read. This is the source of truth. |
| `package.json` → `version` | Kept identical to the manifest. |
| `CHANGELOG.md` | One `## [x.y.z] - YYYY-MM-DD` entry per released version. |

These three files are checked against each other in two places:

- **On every PR:** `__tests__/release.test.ts` fails CI if the versions differ, if the version isn't one
  Chrome accepts, or if `CHANGELOG.md` has no entry for it.
- **At packaging time:** `pnpm build` (via `scripts/zip-dist.mjs`) refuses to create the store zip for the same reasons.

## Day to day: keep `[Unreleased]` current

Any PR that changes what ships in the extension (code under `src/`, `manifest.json`, `popup.html`,
`blocked.html`, `icons/`) adds a line under `## [Unreleased]` in `CHANGELOG.md`, grouped under one of:
`Added`, `Changed`, `Fixed`, `Removed`, `Security`.

Write each line for someone using the extension, not for developers: "Blocked page now shows when the
block ends", not "refactor blocked-page.tsx". Changes that only touch tests or tooling don't need an entry.

## Choosing the version bump

The version is `MAJOR.MINOR.PATCH`. Chrome rejects pre-release suffixes such as `-beta`.

| Bump | When |
|---|---|
| `patch` | Bug fixes and copy changes, with no new behaviour or permissions. |
| `minor` | New user-facing behaviour that needs no new permissions. |
| `major` | Anything that adds permissions or host access, or that breaks compatibility with the web app's sync/analytics API. |

**Adding a permission is a big change.** Chrome disables the extension for existing users until they
accept the new permission prompt, and store reviewers look at it closely. Name it under `Security` in
the changelog and update the permission justifications in the store dashboard.

## Cutting a release

1. **Branch from an up-to-date `main`:**
   ```bash
   git switch main && git pull
   git switch -c release/extension-vX.Y.Z
   ```
2. **Bump the version** (run from the repo root):
   ```bash
   pnpm --filter extension release <patch|minor|major>
   ```
   This updates `manifest.json` and `package.json`, and moves the `[Unreleased]` notes into a dated
   `[X.Y.Z]` entry. It stops without changing anything if `[Unreleased]` is empty or the current
   versions already disagree.
3. **Check the release:**
   ```bash
   pnpm --filter extension test
   pnpm --filter extension test:e2e
   pnpm --filter extension build            # creates dist/block-lock-extension-X.Y.Z.zip
   pnpm --filter extension test:artifacts   # checks the zip's contents
   ```
   Load `services/extension/dist/` unpacked in `chrome://extensions` and smoke-test sign-in, rule
   sync, a scheduled block, a daily limit, and the popup.
4. **Open a PR** titled `release: extension vX.Y.Z` and paste the changelog entry into the description.
   Merge it once CI passes.
5. **Tag the merge commit:**
   ```bash
   git switch main && git pull
   git tag -a extension-vX.Y.Z -m "Extension vX.Y.Z"
   git push origin extension-vX.Y.Z
   ```
6. **Build from the tag and upload:**
   ```bash
   git switch --detach extension-vX.Y.Z
   pnpm --filter extension build
   ```
   Upload `services/extension/dist/block-lock-extension-X.Y.Z.zip` in the Chrome Web Store developer
   dashboard → **Package** → **Upload new package**.
7. **Update the listing if needed.** Do this if permissions, data collection or features changed:
   update the description, the **Privacy practices** tab and the privacy policy (`apps/web/app/privacy`).
   The listing should only describe what the extension itself does. AI features run on the server and
   belong to the web app.
8. **Submit for review.** Once it's approved, create a GitHub release from the tag, using the
   changelog entry as its notes.

## If a release goes wrong

The store can't roll back to an earlier version, and a new upload must always have a higher
version number. To undo a bad release, revert the change on `main`, add a `Fixed` entry, and ship a
new `patch` release through the steps above.

If review rejects a submission, fix the problem and upload again with the same version, as long as
that version was never published. Note the fix in the existing changelog entry.

## Before the first submission

`0.1.0` is already recorded in `CHANGELOG.md` as the first store version. For the first upload,
follow steps 3–8 (no bump needed) and tag the commit you submit as `extension-v0.1.0`. If the
submission happens on a later day, update the entry's date.
