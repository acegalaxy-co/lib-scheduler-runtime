# @kanelr/scheduler-runtime

> **NPM commons library** — Cross-project scheduler runtime: error wrapper + overlap lock + status tracking + Notion catalog sync.
> Cross-cutting rules: see framework `../../rules/00-index.md`.
> ⭐⭐⭐ **Harness Architecture (P0)**: Mọi feature mới BẮT BUỘC route qua 1 trong 5 surfaces (slash command / hook / subagent / MCP / permission). Đọc `../../rules/meta/02-harness-architecture.md`. KHÔNG add ad-hoc scripts.

## Module purpose

Reusable cron job wrapper providing error capture, overlap prevention, run-status reporting, and Notion catalog auto-sync. Project-agnostic; injects notify callback + catalog client.

## Key files

- `index.js` — entry point
- `lib/` — wrappers (overlap lock, status tracker, catalog sync)
- `test/` — unit tests

## Embedded vs imported

Per-project independence — KHÔNG `require()` module này từ project khác. Copy code OK, scope isolation; consumers inject notify + catalog adapters.

## Tests

`npm test` (runs `node --test test/wrappers.test.js`).
