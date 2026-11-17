# Changelog

All notable changes to the Block Lock Chrome extension are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). See [RELEASING.md](RELEASING.md) for how a release is cut.

## [Unreleased]

## [0.1.0] - 2026-11-17

First version submitted to the Chrome Web Store.

### Added
- Blocks distracting sites at the network level using rules synced from the Block Lock dashboard.
- Scheduled blocking windows, including windows that cross midnight (e.g. 22:00–06:00), which run
  from each selected day into the next morning.
- Per-site daily time limits. Minutes only count while a Chrome window is focused and the screen is
  unlocked, so time spent in another app or away from a locked computer doesn't count. Watching a
  video without touching the mouse or keyboard still counts.
- Blocked page shown in place of a blocked site.
- Toolbar popup showing sync status and prompting a fresh sign-in when the session expires.
- Rule changes keep syncing after the dashboard tab is closed. The extension renews its own sync
  credential, and signing out revokes it immediately.
- Time-on-site tracking sent to the dashboard for analytics. Visits are recorded when you close or
  switch tabs, so none are lost when Chrome suspends the extension's background worker, and time a
  tab spends in the background isn't counted.
- Toolbar and store icons at 16, 32, 48 and 128 px.

### Security
- Requests only the `declarativeNetRequest`, `storage`, `alarms` and `idle` permissions plus site
  access. `idle` is used only to check whether the screen is locked so daily limits don't count time
  while you're away; the lock state is never stored or sent anywhere.
- Accepts sign-in and sync messages only from the Block Lock dashboard at blocklock.app.
- Sends the sync token in an `Authorization: Bearer` header, never in the URL, when syncing rules,
  uploading analytics and signing out, so it doesn't appear in server or proxy logs. Requires the
  matching dashboard release; the API doesn't accept `?token=`.
