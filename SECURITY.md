# Security Policy

## Reporting a vulnerability

Please report security issues privately to <security@acegalaxy.co>.

Do **not** open a public GitHub issue for security reports.

We aim to acknowledge within 72 hours and ship a patch within 14 days for valid reports.

## Scope

In scope:

- Privilege escalation via injected `reporter` / `statusTracker` callbacks
- Notion token leakage via error logs / catalog upsert paths
- Lock bypass allowing concurrent re-entry of the same job
- Crashes propagating from catalog sync into wrapped jobs

Out of scope:

- Bugs in the host project's `cronAdapter` (e.g. node-cron itself)
- Notion API rate-limit handling (consumers must own their token quota)
- Issues only reproducible with custom forks of the runtime

## Hardening notes for consumers

- Inject your Notion token from a secret manager — never hardcode in source.
- Gate `catalog.enabled` to PROD/single-host so multiple replicas don't fight on upserts.
- Your `reporter` callback should mask secrets before forwarding to Telegram / Slack.
