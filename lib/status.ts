"use strict";

// Pluggable status tracker. Default = no-op. Project injects a real tracker
// (e.g. Nexus `agent-monitor.trackJobStatus`) via runtime config.

export type JobStatus = "running" | "done" | "failed" | "skipped";
export type StatusTracker = (name: string, status: JobStatus, durationMs?: number) => void;

const _noop: StatusTracker = () => {};
let _trackFn: StatusTracker = _noop;

export function setTracker(fn: StatusTracker | unknown): void {
  _trackFn = typeof fn === "function" ? (fn as StatusTracker) : _noop;
}

export function track(name: string, status: JobStatus, durationMs?: number): void {
  try {
    _trackFn(name, status, durationMs);
  } catch {
    // Never let tracker throw bubble into scheduler.
  }
}

export function _reset(): void {
  _trackFn = _noop;
}

module.exports = { setTracker, track, _reset };
