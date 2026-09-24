"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configure = configure;
exports.isConfigured = isConfigured;
exports._detectSourceFile = _detectSourceFile;
exports._classifyError = _classifyError;
exports.syncSchedulerToCatalog = syncSchedulerToCatalog;
exports._reset = _reset;
// Notion Scheduler Catalog auto-sync.
//
// Generic upsert into a shared Notion DB. Project-agnostic — DB ID, token,
// project slug, host label, and gating predicate ALL injected via configure().
// Catalog is fire-and-forget: failures NEVER block scheduler registration.
//
// Schema expected on the Notion DB (see README):
//   Name (title) | Project (select) | Cron (rich_text) | Host (select)
//   Status (select) | Source File (rich_text) | Schedule TZ (select)
//   Last Reviewed (date)
//
// Auto-managed (overwritten on each register): Cron, Host, Source File, Last Reviewed.
// Manual-managed (preserved when row exists): Description, Type, Status, Notes, Target.
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
let _config = null;
const _syncedThisProcess = new Set();
const _alertedKinds = new Set();
function configure(opts) {
    _config = {
        token: opts.token || "",
        dbId: opts.dbId || "",
        project: opts.project || "",
        host: opts.host || "PROD",
        tz: opts.tz || "Asia/Ho_Chi_Minh",
        enabled: typeof opts.enabled === "function" ? opts.enabled : () => true,
        alertOnce: typeof opts.alertOnce === "function" ? opts.alertOnce : null,
    };
}
function isConfigured() {
    return !!(_config && _config.token && _config.dbId && _config.project);
}
function _detectSourceFile() {
    const e = new Error();
    const stack = (e.stack || "").split("\n").slice(2);
    for (const line of stack) {
        if (line.includes("scheduler-runtime"))
            continue;
        if (line.includes("job-manager"))
            continue;
        const m = line.match(/\(([^)]+):\d+:\d+\)$/) || line.match(/at ([^\s]+):\d+:\d+$/);
        if (m && m[1]) {
            const abs = m[1];
            const repoIdx = abs.indexOf("/src/app/");
            if (repoIdx !== -1)
                return "src/" + abs.slice(repoIdx + 5);
            const serverIdx = abs.indexOf("/server.js");
            if (serverIdx !== -1)
                return "server.js";
            return abs;
        }
    }
    return "";
}
async function _fetchExistingRow(name) {
    if (!_config)
        throw new Error("not configured");
    const dbNorm = String(_config.dbId).replace(/-/g, "");
    const body = {
        page_size: 1,
        filter: {
            and: [
                { property: "Name", title: { equals: name } },
                { property: "Project", select: { equals: _config.project } },
            ],
        },
    };
    const resp = await fetch(`${NOTION_API}/databases/${dbNorm}/query`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${_config.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok)
        throw new Error(`query failed: ${resp.status}`);
    const j = (await resp.json());
    return (j.results || [])[0] || null;
}
async function _patchPage(pageId, properties) {
    if (!_config)
        throw new Error("not configured");
    const resp = await fetch(`${NOTION_API}/pages/${pageId}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${_config.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
    });
    if (!resp.ok)
        throw new Error(`patch failed: ${resp.status}`);
    return resp.json();
}
async function _createPage(properties) {
    if (!_config)
        throw new Error("not configured");
    const dbNorm = String(_config.dbId).replace(/-/g, "");
    const resp = await fetch(`${NOTION_API}/pages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${_config.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ parent: { database_id: dbNorm }, properties }),
    });
    if (!resp.ok)
        throw new Error(`create failed: ${resp.status}`);
    return resp.json();
}
function _classifyError(err) {
    const msg = err instanceof Error ? err.message : String(err || "");
    if (msg.includes("404"))
        return "db_not_found_or_unshared";
    if (msg.includes("401") || msg.includes("403"))
        return "auth_denied";
    if (msg.includes("429"))
        return "rate_limited";
    if (msg.includes("ENOTFOUND") || msg.includes("ECONN") || msg.includes("ETIMEDOUT"))
        return "network";
    if (/\b5\d\d\b/.test(msg))
        return "notion_5xx";
    return "unknown";
}
async function _maybeAlert(kind, name, errMessage) {
    if (_alertedKinds.has(kind))
        return;
    _alertedKinds.add(kind);
    if (_config && _config.alertOnce) {
        try {
            await _config.alertOnce(kind, name, errMessage);
        }
        catch {
            // Alerter itself failing is acceptable.
        }
    }
}
async function syncSchedulerToCatalog(req) {
    const { name, cron, sourceFile } = req;
    if (!isConfigured() || !_config)
        return;
    if (!_config.enabled())
        return;
    if (_syncedThisProcess.has(name))
        return;
    const today = new Date().toISOString().slice(0, 10);
    try {
        const existing = await _fetchExistingRow(name);
        if (existing) {
            await _patchPage(existing.id, {
                Cron: { rich_text: [{ text: { content: cron } }] },
                Host: { select: { name: _config.host } },
                "Source File": { rich_text: [{ text: { content: sourceFile || "" } }] },
                "Last Reviewed": { date: { start: today } },
            });
        }
        else {
            await _createPage({
                Name: { title: [{ text: { content: name } }] },
                Project: { select: { name: _config.project } },
                Cron: { rich_text: [{ text: { content: cron } }] },
                Host: { select: { name: _config.host } },
                Status: { select: { name: "Active" } },
                "Source File": { rich_text: [{ text: { content: sourceFile || "" } }] },
                "Schedule TZ": { select: { name: _config.tz } },
                "Last Reviewed": { date: { start: today } },
            });
        }
        _syncedThisProcess.add(name);
    }
    catch (err) {
        const kind = _classifyError(err);
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[scheduler-runtime/catalog] ${name}: ${kind} — ${msg}`);
        _maybeAlert(kind, name, msg).catch(() => { });
    }
}
function _reset() {
    _config = null;
    _syncedThisProcess.clear();
    _alertedKinds.clear();
}
module.exports = {
    configure,
    isConfigured,
    syncSchedulerToCatalog,
    _detectSourceFile,
    _classifyError,
    _reset,
};
//# sourceMappingURL=catalog.js.map