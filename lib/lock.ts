"use strict";

// In-process overlap lock + report lock.
// For long-running Node processes (Nexus server.js style) where node-cron
// fires inside the same process. NOT for PM2 cron_restart one-shots — those
// need filesystem flock instead (see lock-fs.js when added).

const _runningJobs = new Set<string>();
let _reportRunning = false;

export function isRunning(name: string): boolean {
  return _runningJobs.has(name);
}

export function isReportRunning(): boolean {
  return _reportRunning;
}

export function acquire(name: string): boolean {
  if (_runningJobs.has(name)) return false;
  _runningJobs.add(name);
  return true;
}

export function release(name: string): void {
  _runningJobs.delete(name);
}

export function acquireReport(): boolean {
  if (_reportRunning) return false;
  _reportRunning = true;
  return true;
}

export function releaseReport(): void {
  _reportRunning = false;
}

// Test-only — reset state between unit tests.
export function _reset(): void {
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
