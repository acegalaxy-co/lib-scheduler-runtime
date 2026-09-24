# @acegalaxy/lib-scheduler-runtime

[![npm version](https://img.shields.io/npm/v/@acegalaxy%2Flib-scheduler-runtime.svg)](https://www.npmjs.com/package/@acegalaxy/lib-scheduler-runtime)
[![npm downloads](https://img.shields.io/npm/dm/@acegalaxy%2Flib-scheduler-runtime.svg)](https://www.npmjs.com/package/@acegalaxy/lib-scheduler-runtime)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/node/v/@acegalaxy%2Flib-scheduler-runtime.svg)](https://nodejs.org)


> **Notion-backed cron catalog** — see all your scheduled jobs in one Notion table, with status, last run, and errors auto-tracked. An alternative to BullMQ-only / Inngest when you want a human-readable, ops-friendly source of truth that lives where your team already works.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

## Why

- **Visibility for ops** — every cron in the company shows up in one Notion DB. PM, ops, and on-call all see the same row.
- **No new dashboard.** Status / last run / errors flow into Notion fields you can filter, sort, comment on.
- **Bring-your-own cron.** Works on top of `node-cron`, PM2 `cron_restart`, or any adapter exposing `.schedule()`.
- **Fire-and-forget catalog sync.** Notion failures NEVER bubble into your jobs.
- **Project-agnostic.** Cron adapter, error reporter, status tracker, Notion DB id + token are ALL injected. The runtime hardcodes nothing.

## What's in the box

- **Overlap lock** — same-job re-entry skipped
- **Report lock** — critical reports pause background jobs
- **Pluggable error reporter** — project injects Telegram routing / cooldown
- **Pluggable status tracker** — project injects file/DB persistence
- **Notion catalog auto-sync** — fire-and-forget upsert per registration

## Install

```bash
"@acegalaxy/lib-scheduler-runtime": "github:acegalaxy-co/lib-scheduler-runtime#v0.2.0"
```

## Quick start

**1. Register a cron job**

```js
const cron = require("node-cron");
const runtime = require("@acegalaxy/lib-scheduler-runtime");

// One-time configuration
runtime.configure({
  cronAdapter: cron,                                  // node-cron or compatible
  reporter: (label, err) => myTelegramAlert(label, err),
  statusTracker: (name, status, ms) => myStatusFile(name, status, ms),
  catalog: {
    token: process.env.NOTION_API_KEY,
    dbId: process.env.NOTION_DB_SCHEDULER_CATALOG,
    project: "nexus",                                 // slug for filtering
    host: "PROD",                                     // or "LOCAL"
    tz: "Asia/Ho_Chi_Minh",
    enabled: () => process.env.DOCKER_CONTAINER === "1",
    alertOnce: async (kind, name, msg) => myTelegramAlert(`Catalog ${kind}`, msg),
  },
});

// Register schedulers
runtime.scheduleJob("morning-check", "30 8 * * *", runMorningCheck);
runtime.scheduleJob("daily-report",  "0 18 * * *", runDailyReport, { isReport: true });
```

**2. View status in Notion**

Open your catalog DB. Each registered job appears as a row with `Name`, `Cron`, `Project`, `Host`, `Source File`, `Schedule TZ`, and `Last Reviewed` auto-populated. Add views per project / per host as needed.

**3. Get alerted on failure**

Your injected `reporter(label, err)` is called whenever a wrapped job throws. Pipe it to Telegram, Slack, PagerDuty — whatever your team already uses. The status tracker also flips the row to `failed` so on-call can triage from Notion directly.

## API

### `configure(opts)`

| Field | Type | Notes |
|---|---|---|
| `cronAdapter` | object | Must expose `.schedule(expr, fn, opts)`. Required for `scheduleJob()`. |
| `reporter` | `(label, err) => void` | Called when wrapped fn throws. Default = `console.error`. |
| `statusTracker` | `(name, status, durationMs?) => void` | `status` is `"running"` / `"done"` / `"failed"`. Default = no-op. |
| `catalog` | object | See catalog config below. Skipped if missing token/dbId/project. |

### `catalog` config

| Field | Type | Notes |
|---|---|---|
| `token` | string | Notion integration bearer. |
| `dbId` | string | Notion DB ID (with or without dashes). |
| `project` | string | Project slug, e.g. `"nexus"`. Used for `Project` select column. |
| `host` | string | `"PROD"` or `"LOCAL"`. Project decides. |
| `tz` | string | Default `"Asia/Ho_Chi_Minh"`. |
| `enabled` | `() => boolean` | Gating predicate. Default `() => true`. Use to PROD-gate. |
| `alertOnce` | `async (kind, name, msg) => void` | Optional. Called once per error kind to surface drift. |

### `scheduleJob(name, schedule, fn, options?)`

Wraps `fn`, registers via `cronAdapter`, fires catalog upsert.

- `options.isReport` — if `true`, uses report-lock wrapper (pauses background jobs)
- `options.timezone` — default `"Asia/Ho_Chi_Minh"`

Returns whatever the cron adapter's `schedule()` returns.

### `createBackgroundJob(name, fn)` / `createReportJob(name, fn)`

Standalone wrappers for direct use (e.g. PM2 cron_restart one-shots that don't go through node-cron). Returns `async () => void`.

### `isReportRunning()`

Boolean — true while a report-job is in-flight.

## Notion DB schema

Project must create a Notion DB with these properties (auto-managed):

| Property | Type | Auto/Manual |
|---|---|---|
| `Name` | title | auto |
| `Project` | select | auto |
| `Cron` | rich_text | auto |
| `Host` | select (PROD/LOCAL) | auto |
| `Source File` | rich_text | auto |
| `Schedule TZ` | select | auto |
| `Last Reviewed` | date | auto |
| `Status` | select (Active/Paused/...) | auto on create only |
| `Description` | any | manual (preserved) |
| `Type` | any | manual (preserved) |
| `Notes` | any | manual (preserved) |
| `Target` | any | manual (preserved) |

The DB is **shared across projects** — `Project` column distinguishes rows. Filter views per project as needed.

## Error handling philosophy

- Wrapped fn errors → `reporter(label, err)` + `statusTracker(name, "failed", ms)` + lock released
- Catalog upsert errors → logged + `alertOnce(kind, name, msg)` if configured. NEVER bubbles into caller.
- Reporter / tracker errors → swallowed (logged to stderr). Never crash the scheduler.

## Testing

```bash
npm test
```

15 unit tests cover wrappers, locks, catalog upsert/patch/skip, error classification.
