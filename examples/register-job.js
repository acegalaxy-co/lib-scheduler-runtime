// register-job — minimal example for @acegalaxy/lib-scheduler-runtime
//
// Setup:
//   npm install
//   npm run build
//   node examples/register-job.js

const { configure, scheduleJob } = require("@acegalaxy/lib-scheduler-runtime");

configure({
  token: process.env.NOTION_TOKEN,
  dbId: process.env.CATALOG_DB_ID,
  project: "my-app",
  host: "LOCAL"
});

scheduleJob("hello-cron", "*/5 * * * *", async () => {
  console.log("Hello every 5 minutes");
});
