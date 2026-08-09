# Release Notes — v1.0.7

**GitHub Actions Gate** — Deterministic acceptance gate that accepts a delivery
only when all five rules pass with collector evidence.

## Changes (since v1.0.5)

- **fix: cover all 10 fixtures in weekly-cron-check watchdog** (`08403b0`)
- **Add pr-merged-fail and real-pr12 fixture checks to weekly-cron-check** (`5905447`)
- **chore: track scripts/weekly-cron-check.sh for cron watchdog** (`2359fa4`)

## Detail

The weekly-cron-check watchdog was not exercising all 10 fixture cases. This
release adds the missing `pr-merged-fail` and real-pr12 fixture checks, tracks
the watchdog script in-repo, and ensures every fixture is covered.

## Verification

- Tag `v1.0.7` pushed at commit `08403b0`.
- `gh release create v1.0.7 --notes-from-tag` publishes this release.
