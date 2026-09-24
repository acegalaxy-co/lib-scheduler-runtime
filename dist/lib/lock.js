"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunning = isRunning;
exports.isReportRunning = isReportRunning;
exports.acquire = acquire;
exports.release = release;
exports.acquireReport = acquireReport;
exports.releaseReport = releaseReport;
exports._reset = _reset;
// In-process overlap lock + report lock.
// For long-running Node processes (Nexus server.js style) where node-cron
// fires inside the same process. NOT for PM2 cron_restart one-shots — those
// need filesystem flock instead (see lock-fs.js when added).
const _runningJobs = new Set();
let _reportRunning = false;
function isRunning(name) {
    return _runningJobs.has(name);
}
function isReportRunning() {
    return _reportRunning;
}
function acquire(name) {
    if (_runningJobs.has(name))
        return false;
    _runningJobs.add(name);
    return true;
}
function release(name) {
    _runningJobs.delete(name);
}
function acquireReport() {
    if (_reportRunning)
        return false;
    _reportRunning = true;
    return true;
}
function releaseReport() {
    _reportRunning = false;
}
// Test-only — reset state between unit tests.
function _reset() {
    _runningJobs.clear();
    _reportRunning = false;
}
// CommonJS interop: preserve `const lock = require('./lock')` callers.
module.exports = {
    isRunning,
    isReportRunning,
    acquire,
    release,
    acquireReport,
    releaseReport,
    _reset,
};
//# sourceMappingURL=lock.js.map