"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");

const runtime = require("../dist/index");
const { lock, status, reporter, catalog } = runtime._internals;

beforeEach(() => {
  lock._reset();
  status._reset();
  reporter._reset();
  catalog._reset();
});

test("createBackgroundJob runs fn and tracks done status", async () => {
  const calls = [];
  runtime.configure({ statusTracker: (n, s, d) => calls.push([n, s, d]) });
  const job = runtime.createBackgroundJob("foo", async () => calls.push(["fn"]));
  await job();
  assert.deepEqual(calls.map(c => c[0]), ["foo", "fn", "foo"]);
  assert.equal(calls[0][1], "running");
  assert.equal(calls[2][1], "done");
  assert.ok(typeof calls[2][2] === "number");
});

test("createBackgroundJob skips when already running (overlap lock)", async () => {
  let inflightResolve;
  const inflight = new Promise(r => { inflightResolve = r; });
  let runs = 0;
  const job = runtime.createBackgroundJob("bar", async () => {
    runs++;
    await inflight;
  });
  const p1 = job();
  const p2 = job(); // should skip
  inflightResolve();
  await Promise.all([p1, p2]);
  assert.equal(runs, 1);
});

test("createBackgroundJob releases lock on error and reports", async () => {
  const reports = [];
  runtime.configure({ reporter: (label, err) => reports.push([label, err.message]) });
  const job = runtime.createBackgroundJob("baz", async () => { throw new Error("boom"); });
  await job();
  assert.deepEqual(reports, [["Job: baz", "boom"]]);
  // Lock released → re-run allowed
  let ran = false;
  const job2 = runtime.createBackgroundJob("baz", async () => { ran = true; });
  await job2();
  assert.equal(ran, true);
});

test("createReportJob holds report lock and skips background jobs", async () => {
  const order = [];
  let reportResolve;
  const reportDone = new Promise(r => { reportResolve = r; });
  const reportJob = runtime.createReportJob("daily", async () => {
    order.push("report-start");
    await reportDone;
    order.push("report-end");
  });
  const bgJob = runtime.createBackgroundJob("bg", async () => order.push("bg-ran"));

  const reportP = reportJob("morning");
  // While report is running, bg should skip
  await bgJob();
  reportResolve();
  await reportP;
  // After report done, bg should run
  await bgJob();

  assert.deepEqual(order, ["report-start", "report-end", "bg-ran"]);
});

test("createReportJob skips when another report running", async () => {
  let resolve1;
  const block = new Promise(r => { resolve1 = r; });
  let runs = 0;
  const job = runtime.createReportJob("rep", async () => { runs++; await block; });
  const p1 = job("a");
  const p2 = job("b"); // should skip
  resolve1();
  await Promise.all([p1, p2]);
  assert.equal(runs, 1);
});

test("scheduleJob throws without cronAdapter", () => {
  assert.throws(() => runtime.scheduleJob("x", "* * * * *", () => {}), /cronAdapter/);
});

test("scheduleJob delegates to cronAdapter and wraps fn", async () => {
  let scheduled;
  const fakeCron = {
    schedule(expr, fn, opts) {
      scheduled = { expr, fn, opts };
      return { handle: true };
    },
  };
  runtime.configure({ cronAdapter: fakeCron });
  const handle = runtime.scheduleJob("t1", "*/5 * * * *", async () => "result");
  assert.deepEqual(handle, { handle: true });
  assert.equal(scheduled.expr, "*/5 * * * *");
  assert.equal(scheduled.opts.timezone, "Asia/Ho_Chi_Minh");
  // Wrapped fn should not throw and should run inner fn
  await scheduled.fn();
});

test("reporter default falls back to console.error (does not throw)", () => {
  // Just ensure default reporter doesn't crash
  reporter.report("test", new Error("default"));
});

test("status tracker default no-op (does not throw)", () => {
  status.track("test", "done", 100);
});

test("catalog skipped when not configured", async () => {
  await catalog.syncSchedulerToCatalog({ name: "x", cron: "* * * * *", sourceFile: "" });
  // No throw, no fetch — just returns
  assert.ok(true);
});

test("catalog enabled() gating respected", async () => {
  let fetched = false;
  const origFetch = global.fetch;
  global.fetch = async () => { fetched = true; return { ok: true, json: async () => ({ results: [] }) }; };
  try {
    catalog.configure({
      token: "tok", dbId: "abc", project: "test",
      enabled: () => false,
    });
    await catalog.syncSchedulerToCatalog({ name: "x", cron: "* * * * *", sourceFile: "" });
    assert.equal(fetched, false);
  } finally {
    global.fetch = origFetch;
  }
});

test("catalog upserts via fetch when configured + enabled", async () => {
  const calls = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
    if (url.includes("/databases/") && url.endsWith("/query")) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (url.includes("/pages")) {
      return { ok: true, json: async () => ({ id: "newpage" }) };
    }
    return { ok: false, status: 500 };
  };
  try {
    catalog.configure({ token: "tok", dbId: "db123", project: "test", host: "LOCAL" });
    await catalog.syncSchedulerToCatalog({ name: "myjob", cron: "0 9 * * *", sourceFile: "src/foo.js" });
    assert.equal(calls.length, 2); // query + create
    assert.equal(calls[0].body.filter.and[0].title.equals, "myjob");
    assert.equal(calls[1].body.properties.Project.select.name, "test");
    assert.equal(calls[1].body.properties.Host.select.name, "LOCAL");
  } finally {
    global.fetch = origFetch;
  }
});

test("catalog patches when row exists", async () => {
  const calls = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, method: opts.method });
    if (url.endsWith("/query")) {
      return { ok: true, json: async () => ({ results: [{ id: "existing" }] }) };
    }
    if (url.includes("/pages/existing")) {
      return { ok: true, json: async () => ({ id: "existing" }) };
    }
    return { ok: false, status: 500 };
  };
  try {
    catalog.configure({ token: "tok", dbId: "db123", project: "test" });
    await catalog.syncSchedulerToCatalog({ name: "j", cron: "*/5 * * * *", sourceFile: "" });
    assert.equal(calls[1].method, "PATCH");
    assert.ok(calls[1].url.includes("/pages/existing"));
  } finally {
    global.fetch = origFetch;
  }
});

test("catalog alertOnce called once per kind on failure", async () => {
  const alerts = [];
  const origFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404 });
  try {
    catalog.configure({
      token: "tok", dbId: "db", project: "test",
      alertOnce: async (kind, name, msg) => alerts.push([kind, name]),
    });
    await catalog.syncSchedulerToCatalog({ name: "a", cron: "x", sourceFile: "" });
    await catalog.syncSchedulerToCatalog({ name: "b", cron: "x", sourceFile: "" });
    // Same kind (404 → db_not_found_or_unshared) → only first alert fires
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0][0], "db_not_found_or_unshared");
  } finally {
    global.fetch = origFetch;
  }
});

test("catalog _classifyError maps error messages", () => {
  assert.equal(catalog._classifyError(new Error("query failed: 404")), "db_not_found_or_unshared");
  assert.equal(catalog._classifyError(new Error("query failed: 401")), "auth_denied");
  assert.equal(catalog._classifyError(new Error("query failed: 429")), "rate_limited");
  assert.equal(catalog._classifyError(new Error("ENOTFOUND api.notion.com")), "network");
  assert.equal(catalog._classifyError(new Error("query failed: 503")), "notion_5xx");
  assert.equal(catalog._classifyError(new Error("weird")), "unknown");
});
