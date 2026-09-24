"use strict";

// @acegalaxy/lib-scheduler-runtime — see README.md
//
// Public API:
//   configure(opts)                  one-time runtime config (catalog, reporter, status tracker)
//   scheduleJob(name, cron, fn, o)   wrap fn + register on a node-cron-compatible scheduler
//   createBackgroundJob(name, fn)    standalone wrapper (overlap-skip + try/catch + report + status)
//   createReportJob(name, fn)        wrapper that holds report-lock (pauses background jobs)
//   isReportRunning()                expose lock state
//
// Project responsibilities (NOT in commons):
//   - cron library (node-cron, etc.) — pass via opts.cronAdapter or use scheduleJob()
//   - error reporter (Telegram routing, cooldown) — inject via reporter
//   - status persistence (file/db) — inject via statusTracker
//   - catalog gating (PROD-only, env-gated) — inject via catalog.enabled

import * as lock from "./lib/lock";
import * as status from "./lib/status";
import * as reporter from "./lib/reporter";
import * as catalog from "./lib/catalog";
import type { ErrorReporter } from "./lib/reporter";
import type { StatusTracker } from "./lib/status";
import type { CatalogConfig } from "./lib/catalog";

export type WrappedJob = () => Promise<void>;
export type WrappedReportJob = (mode?: string) => Promise<void>;

/** Minimal cron adapter contract. Compatible with node-cron + similar libs. */
export interface CronAdapter {
  schedule(
    expression: string,
    fn: WrappedJob | WrappedReportJob,
    opts?: { timezone?: string },
  ): unknown;
}

export interface ConfigureOpts {
  reporter?: ErrorReporter;
  statusTracker?: StatusTracker;
  catalog?: CatalogConfig;
  cronAdapter?: CronAdapter;
}

export interface ScheduleJobOptions {
  timezone?: string;
  isReport?: boolean;
}

let _cronAdapter: CronAdapter | null = null;

export function configure(opts: ConfigureOpts = {}): void {
  if (opts.reporter) reporter.setReporter(opts.reporter);
  if (opts.statusTracker) status.setTracker(opts.statusTracker);
  if (opts.catalog) catalog.configure(opts.catalog);
  if (opts.cronAdapter) _cronAdapter = opts.cronAdapter;
}

export function createBackgroundJob(name: string, fn: () => Promise<void> | void): WrappedJob {
  return async function wrapped(): Promise<void> {
    if (lock.isReportRunning()) {
      console.log(`⏸️ ${name} skipped — report running`);
      return;
    }
    if (!lock.acquire(name)) {
      console.log(`⏸️ ${name} skipped — previous run still active`);
      return;
    }
    const start = Date.now();
    try {
      status.track(name, "running");
      console.log(`⏰ Cron triggered: ${name}`);
      await fn();
      status.track(name, "done", Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ ${name} error: ${msg}`);
      reporter.report(`Job: ${name}`, err);
      status.track(name, "failed", Date.now() - start);
    } finally {
      lock.release(name);
    }
  };
}

export function createReportJob(
  name: string,
  fn: (mode?: string) => Promise<void> | void,
): WrappedReportJob {
  return async function wrapped(mode?: string): Promise<void> {
    if (!lock.acquireReport()) {
      console.log(`⏸️ ${name} (${mode || ""}) skipped — another report running`);
      return;
    }
    const start = Date.now();
    const tag = `${name}:${mode || ""}`;
    try {
      status.track(tag, "running");
      console.log(`⏰ Cron triggered: ${name} (${mode || ""}) — pausing other schedulers`);
      await fn(mode);
      status.track(tag, "done", Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Scheduler error (${name}): ${msg}`);
      reporter.report(`Scheduler: ${name}`, err);
      status.track(tag, "failed", Date.now() - start);
    } finally {
      lock.releaseReport();
      console.log(`✅ ${name} (${mode || ""}) done — resuming other schedulers`);
    }
  };
}

export function scheduleJob(
  name: string,
  schedule: string,
  fn: (mode?: string) => Promise<void> | void,
  options: ScheduleJobOptions = {},
): unknown {
  if (!_cronAdapter) {
    throw new Error("scheduler-runtime: configure({ cronAdapter }) before scheduleJob()");
  }
  const { timezone = "Asia/Ho_Chi_Minh", isReport = false } = options;
  const wrapped = isReport ? createReportJob(name, fn) : createBackgroundJob(name, fn as () => Promise<void> | void);
  const handle = _cronAdapter.schedule(schedule, wrapped, { timezone });

  // Catalog upsert — fire-and-forget, never throws into caller. sourceFile
  // detected here so the helper sees the *caller's* stack frame, not commons.
  try {
    const sourceFile = catalog._detectSourceFile();
    catalog.syncSchedulerToCatalog({ name, cron: schedule, sourceFile }).catch(() => {});
  } catch {
    /* no-op */
  }

  return handle;
}

export const isReportRunning = lock.isReportRunning;

// CommonJS interop: keep existing `const r = require("@acegalaxy/lib-scheduler-runtime")` callers.
module.exports = {
  configure,
  scheduleJob,
  createBackgroundJob,
  createReportJob,
  isReportRunning: lock.isReportRunning,
  // For tests + advanced wiring
  _internals: { lock, status, reporter, catalog },
};
