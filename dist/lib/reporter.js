"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setReporter = setReporter;
exports.report = report;
exports._reset = _reset;
const _defaultReport = (label, err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler-runtime] ${label}: ${msg}`);
};
let _reportFn = _defaultReport;
function setReporter(fn) {
    if (typeof fn === "function")
        _reportFn = fn;
}
function report(label, err) {
    try {
        _reportFn(label, err);
    }
    catch {
        // Reporter itself failing — log to stderr as last resort.
        try {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[scheduler-runtime] reporter failed for ${label}: ${msg}`);
        }
        catch {
            /* no-op */
        }
    }
}
function _reset() {
    _reportFn = _defaultReport;
}
module.exports = { setReporter, report, _reset };
//# sourceMappingURL=reporter.js.map