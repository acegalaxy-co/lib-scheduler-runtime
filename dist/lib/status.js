"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setTracker = setTracker;
exports.track = track;
exports._reset = _reset;
const _noop = () => { };
let _trackFn = _noop;
function setTracker(fn) {
    _trackFn = typeof fn === "function" ? fn : _noop;
}
function track(name, status, durationMs) {
    try {
        _trackFn(name, status, durationMs);
    }
    catch {
        // Never let tracker throw bubble into scheduler.
    }
}
function _reset() {
    _trackFn = _noop;
}
module.exports = { setTracker, track, _reset };
//# sourceMappingURL=status.js.map