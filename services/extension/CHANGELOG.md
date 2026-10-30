# Changelog

All notable changes to the Block Lock Chrome extension are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). See [RELEASING.md](RELEASING.md) for how a release is cut.

## [Unreleased]

### Fixed
- Schedules that cross midnight (e.g. 22:00–06:00) now block. Previously they never matched, so the
  site was never blocked. The window runs from each selected day into the next morning.
- Browsing analytics no longer lose visits when Chrome suspends the extension's background worker,
  which happens after about 30 seconds without activity. Closing a tab and switching tabs now
  record the visit, and time a tab spends in the background is no longer counted.

### Fixed
- Daily time limits only count minutes while a Chrome window is focused and the screen is unlocked.
  Previously time on a limited site kept counting while you used another app or were away with
  your computer locked. Watching a video without touching the mouse or keyboard still counts.
- Rule changes keep syncing after the dashboard tab is closed. The extension now renews its own
  sync credential instead of showing "session expired" about 15 minutes after the tab closes.
  Signing out still revokes it immediately.

### Security
- The sync token is now sent in an `Authorization: Bearer` header instead of the URL when syncing
  rules, uploading analytics and signing out, so it no longer appears in server or proxy logs.
  Requires the matching dashboard release; the API no longer accepts `?token=`.
- Requests the `idle` permission, used only to check whether the screen is locked so daily limits
  don't count time while you're away. The lock state is never stored or sent anywhere.
- The extension no longer accepts sign-in or sync messages from pages on `localhost`. Only the
  Block Lock dashboard at blocklock.app can connect it to an account.

## [0.1.0] - 2026-10-04

First version submitted to the Chrome Web Store.

### Added
- Blocks distracting sites at the network level using rules synced from the Block Lock dashboard.
- Scheduled blocking windows and per-site daily time limits.
- Blocked page shown in place of a blocked site.
- Toolbar popup showing sync status and prompting a fresh sign-in when the session expires.
- Time-on-site tracking sent to the dashboard for analytics.
- Toolbar and store icons at 16, 32, 48 and 128 px.

### Security
- Requests only the `declarativeNetRequest`, `storage` and `alarms` permissions plus site access.
- Accepts messages only from blocklock.app and localhost during development.
