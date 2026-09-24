"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReportRunning = void 0;
exports.configure = configure;
exports.createBackgroundJob = createBackgroundJob;
exports.createReportJob = createReportJob;
exports.scheduleJob = scheduleJob;
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
const lock = __importStar(require("./lib/lock"));
const status = __importStar(require("./lib/status"));
const reporter = __importStar(require("./lib/reporter"));
const catalog = __importStar(require("./lib/catalog"));
let _cronAdapter = null;
function configure(opts = {}) {
    if (opts.reporter)
        reporter.setReporter(opts.reporter);
    if (opts.statusTracker)
        status.setTracker(opts.statusTracker);
    if (opts.catalog)
        catalog.configure(opts.catalog);
    if (opts.cronAdapter)
        _cronAdapter = opts.cronAdapter;
}
function createBackgroundJob(name, fn) {
    return async function wrapped() {
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`❌ ${name} error: ${msg}`);
            reporter.report(`Job: ${name}`, err);
            status.track(name, "failed", Date.now() - start);
        }
        finally {
            lock.release(name);
        }
    };
}
function createReportJob(name, fn) {
    return async function wrapped(mode) {
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`❌ Scheduler error (${name}): ${msg}`);
            reporter.report(`Scheduler: ${name}`, err);
            status.track(tag, "failed", Date.now() - start);
        }
        finally {
            lock.releaseReport();
            console.log(`✅ ${name} (${mode || ""}) done — resuming other schedulers`);
        }
    };
}
function scheduleJob(name, schedule, fn, options = {}) {
    if (!_cronAdapter) {
        throw new Error("scheduler-runtime: configure({ cronAdapter }) before scheduleJob()");
    }
    const { timezone = "Asia/Ho_Chi_Minh", isReport = false } = options;
    const wrapped = isReport ? createReportJob(name, fn) : createBackgroundJob(name, fn);
    const handle = _cronAdapter.schedule(schedule, wrapped, { timezone });
    // Catalog upsert — fire-and-forget, never throws into caller. sourceFile
    // detected here so the helper sees the *caller's* stack frame, not commons.
    try {
        const sourceFile = catalog._detectSourceFile();
        catalog.syncSchedulerToCatalog({ name, cron: schedule, sourceFile }).catch(() => { });
    }
    catch {
        /* no-op */
    }
    return handle;
}
exports.isReportRunning = lock.isReportRunning;
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
//# sourceMappingURL=index.js.map