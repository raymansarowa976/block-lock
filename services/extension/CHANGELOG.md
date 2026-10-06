# Changelog

All notable changes to the Block Lock Chrome extension are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). See [RELEASING.md](RELEASING.md) for how a release is cut.

## [Unreleased]

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
