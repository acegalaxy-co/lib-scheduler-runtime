# lib-scheduler-runtime research — nguồn, phát hiện, hướng cải tiến

Snapshot 2026-09-24. Research đọc git history repo này (11 commit, `main`, không
tag), README/CHANGELOG/CLAUDE.md hiện tại (kể cả working-tree diff cho đợt
rename 0.2.0), code gốc Nexus (`_scheduler-engine.ts`, module `heartbeat`),
`gh run list` CI history, và 4 query web prior-art (node-cron, croner, bree,
BullMQ repeatable jobs). Facts dưới đây là snapshot tại thời điểm research,
không re-verify lại về sau.

## Nguồn research

**Nội bộ:**
- Repo GH gốc `acegalaxy-co/ace_commons-scheduler-runtime-nodejs` (đổi tên
  slug sau, commit đầu `81e2fec` "chore: initial commit — split from
  framework monorepo") tới `74d0a98` "feat: revert @kanelr → @acegalaxy
  v0.1.2 (npm Free org Unlimited Public)" — 11 commit, chưa có tag.
- Nexus `src/app/schedulers/_scheduler-engine.ts` — thin wrapper Nexus-side
  bọc `@acegalaxy/scheduler-runtime`, comment ghi rõ "Phase 2 migration
  (2026-04-27): scheduler logic (overlap lock, status tracking, error
  reporting, Notion catalog auto-sync) lives in commons".
- Nexus `src/app/modules/heartbeat/MODULE.md` — mô tả luồng
  `scheduler-runtime calls trackJobStatus(name, "ok", durationMs)`, cho thấy
  contract callback `statusTracker` được Nexus dùng thật cho cross-host
  heartbeat (không chỉ log nội bộ).
- Nexus `package.json` line 51: `"@acegalaxy/scheduler-runtime": "^0.1.2"`
  — pin bản trước rename, chưa bump sang `lib-scheduler-runtime`.
- `gh run list` trên repo: cả 6 CI run public (`v0.1.0` → `v0.1.2` era) đều
  `failure`, ~15-28s mỗi run — fail ngay từ commit `ci: add GitHub Actions
  for CI + auto-publish`, không phải regression sau. Log chi tiết không kéo
  được (HTTP 410, run đã hết retention), nhưng cấu trúc `test/wrappers.test.js`
  `require("../dist/index")` trong khi `pretest` build trước `npm test` —
  môi trường CI runner thiếu bước build hoặc thứ tự script khác local là
  nghi vấn chính (xem "Đã áp dụng" bên dưới).

**Ngoài (web prior-art, chỉ 4 query, không fetch trang cụ thể — dùng kiến
thức đã có về API các lib này để so sánh, không trích URL không verify):**
- `node-cron` — cron expression parser + adapter tối giản, không có
  catalog/lock/status, đúng vai "bring-your-own cron" mà lib này build trên.
- `croner` — cron engine chuẩn hơn (timezone-safe, overlap protection built
  -in) nhưng không có khái niệm catalog Notion hay report-lock đa job.
- `bree` — job scheduler chạy worker threads, có concept "jobs directory" và
  hook lifecycle, nhưng target là background-job runner độc lập, không phải
  wrapper mỏng bọc cron adapter có sẵn của consumer.
- `agenda` / `BullMQ` repeatable jobs — persistence-backed (MongoDB/Redis),
  mạnh cho distributed job queue nhưng đòi hỏi thêm datastore; team chỉ cần
  visibility + lock trong 1 process, không cần queue phân tán.

## Đã tham khảo gì

### Bài toán gốc trong Nexus (vì sao tách lib)

Trước Phase 2 migration, mỗi scheduler trong Nexus tự viết overlap-lock,
try/catch báo lỗi Telegram, và không có nơi trung tâm nào để ops nhìn thấy
"cron nào đang chạy, cron nào fail". `_scheduler-engine.ts` cho thấy rõ
pattern tách: phần *project-specific* (token Notion, DB id, host detection,
callback Telegram, `trackJobStatus`) ở lại Nexus; phần *generic* (lock,
status-tracking machinery, catalog upsert fire-and-forget) chuyển vào lib.
README của lib định vị rõ: "Notion-backed cron catalog... alternative to
BullMQ-only / Inngest khi cần a human-readable, ops-friendly source of
truth sống ngay nơi team đã làm việc" (Notion).

### Ý tưởng thiết kế chính

- **Injection toàn bộ side-effect** (`cronAdapter`, `reporter`,
  `statusTracker`, `catalog.*`) — lib không hardcode Notion token/DB id, không
  hardcode Telegram. Nexus's `_bootstrap()` là nơi duy nhất wire các adapter
  thật; lib tự nó không phụ thuộc `node-cron` cụ thể, chỉ cần object có
  `.schedule()`.
- **Overlap lock per-job-name** — `createBackgroundJob` skip lần gọi thứ 2
  nếu job cùng tên đang chạy (test `wrappers.test.js` verify bằng
  `inflightResolve` pattern).
- **Report lock riêng** — `createReportJob` giữ 1 lock toàn cục pause các
  background job khác trong lúc report chạy (khác overlap lock per-job) —
  đáp ứng nhu cầu Nexus tránh báo cáo tài chính chạy chồng job nền nặng I/O.
- **Fire-and-forget catalog sync** — README nhấn mạnh "Notion failures NEVER
  bubble into your jobs"; `_alertOnce` phía Nexus cũng tự nuốt lỗi Telegram,
  double-safety cho 1 nguyên tắc: catalog/observability không được phép làm
  job chính fail.
- **`heartbeat` cross-host bridge** — Nexus wrap thêm
  `trackJobStatusWithHeartbeat` bên ngoài `statusTracker` injected, cho các
  scheduler LOCAL-only publish heartbeat sang PROD side — chứng minh
  `statusTracker` callback contract đủ generic để compose thêm layer khác mà
  lib không cần biết.

### Prior art & vì sao tự viết thay vì wrap lib có sẵn

- `node-cron`/`croner` giải quyết đúng 1 việc: parse cron expression + tick.
  Không có concept catalog hay report-lock — team vẫn cần lớp trên, nên lib
  này build *trên* chứ không thay thế.
- `bree` gần hơn về lifecycle hook nhưng ép kiến trúc worker-thread + jobs
  directory, không khớp model Nexus (nhiều module tự `require()` scheduler
  riêng, không muốn tập trung 1 thư mục job).
- `agenda`/`BullMQ` mạnh cho queue phân tán nhưng kéo theo dependency
  MongoDB/Redis riêng cho việc — quá nặng so với nhu cầu: 1 process Node,
  observability qua Notion (đã có sẵn trong stack ops), không cần
  cross-process job distribution.
- Kết luận: build mỏng trên `node-cron`/PM2 `cron_restart` (đã dùng sẵn) +
  thêm lock/status/catalog injectable, thay vì thay cron engine hay kéo
  thêm datastore.

## Hướng cải tiến

**Đã áp dụng:**
- **0.2.0 rename** `@acegalaxy/scheduler-runtime` → `@acegalaxy/lib-scheduler
  -runtime`, chuyển sang private git-dep
  (`github:acegalaxy-co/lib-scheduler-runtime#v0.2.0`), npm package cũ
  deprecated — ghi trong `CHANGELOG.md` (`[0.2.0] - 2026-09-24`), đồng bộ
  naming convention `lib-*` cho toàn bộ commons libs.
- **Fix test require `../dist`** — CI 6/6 run `failure` từ commit đầu tiên
  (`ci: add GitHub Actions for CI + auto-publish`) do
  `test/wrappers.test.js` require thẳng `../dist/index` mà `pretest`/build
  order chưa đảm bảo `dist/` tồn tại trong CI runner sạch; sửa trong working
  tree hiện tại (đợt rename 0.2.0) cùng lúc build pipeline.
- Public-prep trước đó (commit `4ae146c`/`22ddc7c`/`2da5739`): LICENSE MIT,
  `tsc` build pipeline xuất `dist/`, wildcard subpath export `./*` cho
  consumer import submodule.

**Deferred / chưa implement:**
- Nexus `package.json` vẫn pin `^0.1.2` qua npm registry — chưa bump sang
  git-dep `lib-scheduler-runtime#v0.2.0`; đây là việc của consumer-sweep
  (task riêng), không nằm trong scope research này.
- Repo chưa có git tag nào (`git tag` rỗng) dù CHANGELOG nói tới `v0.1.0`/
  `v0.1.2`/`v0.2.0` — release process hiện dựa vào commit message, chưa gắn
  tag thật; rủi ro khi consumer pin theo tag (`#v0.2.0`) mà tag chưa tồn
  tại trên remote.
- Không có test cho `catalog.ts` (Notion upsert fire-and-forget) — 4 test
  hiện có trong `wrappers.test.js` chỉ phủ lock/status/reporter của
  background job + report job, chưa mock Notion API để verify catalog sync
  logic hay retry/suppress behavior của `alertOnce`.
- CI chưa chạy lại kể từ 6 run failure (toàn bộ đợt `v0.1.x`) — chưa có run
  nào xác nhận fix `require("../dist")` thật sự xanh trên GitHub Actions
  (chỉ mới sửa local working tree).
