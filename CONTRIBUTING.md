# Contributing to @acegalaxy/lib-scheduler-runtime

Thanks for your interest! This package is part of the [ace_commons](https://github.com/acegalaxy-co) collection.

## Ground rules

- **Project-agnostic stays project-agnostic.** Cron adapter, error reporter, status tracker, Notion DB id + token are ALL injected by the host project. The runtime hardcodes nothing project-specific.
- **Catalog upserts are fire-and-forget.** Failure to sync to Notion MUST never bubble into the wrapped job.
- **Wrapped jobs never crash the scheduler.** Errors route through `reporter()` + release the lock.
- **No direct Notion SDK leakage.** Catalog uses raw HTTP under the hood — keep it that way to avoid forcing a SDK version on consumers.

## Dev setup

```bash
git clone https://github.com/acegalaxy-co/lib-scheduler-runtime.git
cd lib-scheduler-runtime
npm install
npm test
```

## Pull request checklist

- [ ] `npm test` passes (15 unit tests)
- [ ] No new hardcoded project slugs / DB IDs / tokens
- [ ] New config fields documented in README "API" section
- [ ] New Notion DB columns documented in README "Notion DB schema" section
- [ ] No secrets in diff

## Reporting bugs / requesting features

Open an issue at <https://github.com/acegalaxy-co/lib-scheduler-runtime/issues>.

## Code of Conduct

By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
