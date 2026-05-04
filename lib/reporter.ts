"use strict";

// Pluggable error reporter. Default = console.error only. Project injects
// its own reporter (Nexus reportError → Telegram with cooldown, Framework
// scripts/notify-telegram.js, etc.) via runtime config.
//
// Contract: reporter(label, error) — called when scheduler fn throws.
// Must be sync or fire-and-forget. Errors thrown by reporter itself are
// swallowed.

export type ErrorReporter = (label: string, err: unknown) => void;

const _defaultReport: ErrorReporter = (label, err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[scheduler-runtime] ${label}: ${msg}`);
};

let _reportFn: ErrorReporter = _defaultReport;

export function setReporter(fn: ErrorReporter | unknown): void {
  if (typeof fn === "function") _reportFn = fn as ErrorReporter;
}

export function report(label: string, err: unknown): void {
  try {
    _reportFn(label, err);
  } catch {
    // Reporter itself failing — log to stderr as last resort.
    try {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler-runtime] reporter failed for ${label}: ${msg}`);
    } catch {
      /* no-op */
    }
  }
}

export function _reset(): void {
  _reportFn = _defaultReport;
}

module.exports = { setReporter, report, _reset };
