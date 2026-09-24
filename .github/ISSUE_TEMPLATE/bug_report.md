---
name: Bug report
about: Report a defect in @acegalaxy/lib-scheduler-runtime
title: "[bug] "
labels: bug
---

## What happened

<!-- e.g. wrapped job error didn't reach reporter; catalog upsert overwrote manual Description column -->

## Expected behavior

## Reproduction

```js
runtime.configure({ ... });
runtime.scheduleJob("...", "...", async () => { ... });
```

## Environment

- runtime version:
- node version:
- cron adapter (node-cron / other):
- host (LOCAL / PROD / docker):

## Logs / stack trace

<!-- redact any tokens before pasting -->
