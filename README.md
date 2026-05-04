# @acegalaxy/scheduler-runtime

Cross-project scheduler runtime for Node.js. Wraps cron jobs with:
- **Overlap lock** — same-job re-entry skipped
- **Report lock** — critical reports pause background jobs
- **Pluggable error reporter** — project injects Telegram routing / cooldown
- **Pluggable status tracker** — project injects file/DB persistence
- **Notion catalog auto-sync** — fire-and-forget upsert per registration

Project-agnostic: cron library, error reporter, status tracker, Notion DB ID + token are ALL injected. Commons does NOT hardcode any project-specific concern.

## Install

In a sibling project (e.g. `projects_repos/imba/ace_ace_nexus-one_nodejs/`):

```js
const runtime = require("../../../ace_commons/scheduler-runtime-nodejs");
```

## Quick start

```js
const cron = require("node-cron");
const runtime = require("@acegalaxy/scheduler-runtime");

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
