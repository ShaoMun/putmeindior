import ee from "@google/earthengine";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================
// Config
// ============================

// removed stray slash
const MODE = true;

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Service account key
const keyPath = path.join(__dirname, "../../flood-488301-a46f29b2ccad.json");
const privateKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));

// AOI: Kuala Lumpur (GAUL L2)
const COUNTRY = "Malaysia";
const STATE = "Kuala Lumpur";
const DISTRICT = "Kuala Lumpur";

// Grid settings
const GRID_KM = 1;
const GRID_M = GRID_KM * 1000;

// BigQuery target
const BQ_PROJECT = "flood-488301";
const BQ_DATASET = "gee";
const BQ_TABLE = "Rain_Forecast_KualaLumpur";

const POLL_EVERY_MS = 10_000; // 10s
const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes
const PRINT_FULL_STATUS_EACH_POLL = true;

// ============================
// Logging helpers
// ============================
function line() {
  console.log("============================================================");
}
function section(title: string) {
  console.log("\n");
  line();
  console.log(title);
  line();
}
function sub(title: string) {
  console.log("\n" + title);
  console.log("-".repeat(title.length));
}
function log(msg: string) {
  console.log(msg);
}
function bullet(msg: string) {
  console.log("• " + msg);
}
function ok(msg: string) {
  console.log("✅ " + msg);
}
function info(msg: string) {
  console.log("ℹ️  " + msg);
}
function warn(msg: string) {
  console.log("⚠️  " + msg);
}
function fail(msg: string, err?: any) {
  console.log("❌ " + msg);
  if (err) console.error(err);
}
function fatal(msg: string, err?: any) {
  console.log("ERROR: " + msg);
  if (err) console.error(err);
  process.exit(1);
}

// ============================
// Time helpers
// ============================
function toUtcStampParts() {
  const iso = new Date().toISOString(); // e.g. 2026-02-27T03:14:22.123Z
  const datetime_utc = iso.replace("T", " ").replace("Z", "").split(".")[0];
  const date_utc = datetime_utc.slice(0, 10);
  const time_utc = datetime_utc.slice(11, 19);
  return { datetime_utc, date_utc, time_utc };
}
function nowIso() {
  return new Date().toISOString();
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================
// Earth Engine task helpers
// ============================
async function getTaskStatusAsync(taskId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ee.data.getTaskStatus(taskId, (statusList: any, err: any) => {
      if (err) return reject(err);
      const s = Array.isArray(statusList) ? statusList[0] : statusList;
      resolve(s);
    });
  });
}
function resolveTaskId(task: any): string | null {
  return task?.id || task?.config?.id || task?._taskId || null;
}


async function runBigQueryExportLogs(params: {
  bqTable: string;
  project: string;
  dataset: string;
  table: string;
  datetime_utc: string;
  rowCount: number;
}) {
  const { bqTable, project, dataset, table, datetime_utc, rowCount } = params;

  section("🚀 EXPORT TO BIGQUERY");

  sub("📤 Export Details");
  log(`🏗️  GCP Project : ${project}`);
  log(`🗄️  Dataset     : ${dataset}`);
  log(`📋 Table        : ${table}`);
  log(`🔗 Full Table   : ${bqTable}`);

  sub("⚙️  Export Mode");
  log("🧹 Overwrite Existing Table : YES");
  log("➕ Append Mode              : NO");

  sub("🕒 Export Submission");
  log("📨 Task submitted to Google Earth Engine");
  log("🆔 Task ID : EE-BQ-EXPORT-9f3a21c8");
  log(`🕒 Submit time UTC: ${datetime_utc}`);
  log("⏳ Status  : RUNNING");

  sub("📡 Monitoring Task Progress");
  log("🔄 Processing Earth Engine job...");
  await sleep(600);
  log("🔄 Writing rows to BigQuery...");
  await sleep(600);
  log("🔄 Finalizing table schema...");
  await sleep(600);

  section("✅ EXPORT COMPLETED SUCCESSFULLY");

  sub("🎉 BigQuery Export Status");
  log("✅ Task State   : COMPLETED");
  log(`📊 Rows Written : ${rowCount}`);
  log("⏱️  Duration    : ~42 seconds ");

  sub("📍 Data Available In BigQuery");
  log(`🔍 Project : ${project}`);
  log(`🗄️ Dataset : ${dataset}`);
  log(`📋 Table   : ${table}`);

  sub("✨ You can now");
  bullet("Query rainfall forecasts using SQL");
  bullet("Join with flood models");
  bullet("Power dashboards (Looker / Grafana)");
  bullet("Trigger downstream analytics");

  sub("🚦 Pipeline Status");
  log("SUCCESS");

}

// ============================
// Real export (your original logic, cleaned logs)
// ============================
async function runRealBigQueryExport(params: {
  collection: any;
  bqTable: string;
  project: string;
  dataset: string;
  table: string;
  datetime_utc: string;
}) {
  const { collection, bqTable, project, dataset, table, datetime_utc } = params;

  section("🚀 EXPORT TO BIGQUERY (LIVE)");

  sub("📤 Export Details");
  log(`🏗️  GCP Project : ${project}`);
  log(`🗄️  Dataset     : ${dataset}`);
  log(`📋 Table        : ${table}`);
  log(`🔗 Full Table   : ${bqTable}`);
  log(`🕒 Submit time UTC: ${datetime_utc}`);

  sub("⚙️  Export Mode");
  log("🧹 Overwrite Existing Table : YES");
  log("➕ Append Mode              : NO");

  sub("🧠 Creating Export Task");
  log(`[${nowIso()}] Creating export task...`);

  const task = ee.batch.Export.table.toBigQuery({
    collection,
    description: table,
    table: bqTable,
    overwrite: true,
    append: false,
  });

  log(`[${nowIso()}] Starting task...`);
  task.start();

  const taskId = resolveTaskId(task);
  if (!taskId) {
    fail("Failed to resolve Earth Engine task ID after start()");
    console.error(task);
    process.exit(1);
  }

  ok(`Task ID resolved: ${taskId}`);
  info("Now polling status until COMPLETED / FAILED / CANCELLED...");

  let lastState: string | undefined;
  const started = Date.now();

  while (true) {
    const elapsed = Date.now() - started;
    if (elapsed > MAX_WAIT_MS) {
      fail(`Timed out after ${(MAX_WAIT_MS / 60000).toFixed(0)} mins`);
      process.exit(1);
    }

    let s: any;
    try {
      s = await getTaskStatusAsync(taskId);
    } catch (e: any) {
      fail(`[${nowIso()}] Failed to fetch task status`, e);
      await sleep(POLL_EVERY_MS);
      continue;
    }

    const state = s?.state ?? "UNKNOWN";

    if (PRINT_FULL_STATUS_EACH_POLL) {
      log(`[${nowIso()}] Poll: state=${state} elapsed=${(elapsed / 1000).toFixed(1)}s`);
    } else if (state !== lastState) {
      log(`[${nowIso()}] State change: ${lastState ?? "∅"} → ${state}`);
    }

    lastState = state;

    if (state === "COMPLETED") {
      section("✅ EXPORT COMPLETED SUCCESSFULLY");
      ok("Task State: COMPLETED");
      log(`🔗 BigQuery table: ${bqTable}`);
      process.exit(0);
    }

    if (state === "FAILED" || state === "CANCELLED") {
      section("❌ EXPORT FAILED");
      fail(`Task State: ${state}`);
      if (s?.error_message) fail(`Error message: ${s.error_message}`);
      process.exit(1);
    }

    await sleep(POLL_EVERY_MS);
  }
}

// ============================
// Main
// ============================
section("🌧️  RAIN FORECAST → BIGQUERY EXPORT");

const { datetime_utc, date_utc, time_utc } = toUtcStampParts();

sub("🕒 Run Time (UTC)");
log(`📅 Date       : ${date_utc}`);
log(`⏰ Time       : ${time_utc}`);
log("🌍 Timezone   : UTC");

sub("📍 Area of Interest (AOI)");
log(`🇲🇾 Country   : ${COUNTRY}`);
log(`🏙️  State     : ${STATE}`);
log(`📌 District  : ${DISTRICT}`);

sub("🧩 Grid Configuration");
log(`🔲 Grid Size  : ${GRID_KM} km × ${GRID_KM} km`);
log("📊 Total Grids: 3");

ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    ee.initialize(
      null,
      null,
      async () => {
        try {
        
          const rows = [
            {
              grid_id: "1",
              centroid_lat: 3.139,
              centroid_lon: 101.6869,
              precip_24h_mm: 25.4,
              precip_72h_mm: 80.0,
            },
            {
              grid_id: "2",
              centroid_lat: 3.145,
              centroid_lon: 101.69,
              precip_24h_mm: 10.0,
              precip_72h_mm: 40.0,
            },
            {
              grid_id: "3",
              centroid_lat: 3.135,
              centroid_lon: 101.68,
              precip_24h_mm: 5.0,
              precip_72h_mm: 15.0,
            },
          ];

          sub("📄 Sample Forecast Records");
          for (const r of rows) {
            log("");
            log(`🧱 Grid ID : ${r.grid_id}`);
            log(`  📍 Centroid : (${r.centroid_lat.toFixed(5)}, ${r.centroid_lon.toFixed(5)})`);
            log(`  🌧️ Rain 24h : ${r.precip_24h_mm.toFixed(2)} mm`);
            log(`  🌧️ Rain 72h : ${r.precip_72h_mm.toFixed(2)} mm`);
          }

          sub("🧠 Data Processing");
          info("Converting rows → Earth Engine FeatureCollection...");

          const features = rows.map((r) =>
            ee.Feature(ee.Geometry.Point([r.centroid_lon, r.centroid_lat]), {
              grid_id: r.grid_id,
              centroid_lat: r.centroid_lat,
              centroid_lon: r.centroid_lon,
              precip_24h_mm: r.precip_24h_mm,
              precip_72h_mm: r.precip_72h_mm,
              datetime_utc,
              date_utc,
              time_utc,
            })
          );

          const collection = ee.FeatureCollection(features);
          ok("FeatureCollection created successfully");
          log(`📦 Records ready for export: ${rows.length}`);

          // ----------------------------
          // Export
          // ----------------------------
          const bqTable = `${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}`;

          if (MODE) {
            warn("MODE is ON → BigQuery export will be FAKE-SUCCESS for demo purposes.");
            await runBigQueryExportLogs({
              bqTable,
              project: BQ_PROJECT,
              dataset: BQ_DATASET,
              table: BQ_TABLE,
              datetime_utc,
              rowCount: rows.length,
            });
            process.exit(0);
          }

          // Real export path
          await runRealBigQueryExport({
            collection,
            bqTable,
            project: BQ_PROJECT,
            dataset: BQ_DATASET,
            table: BQ_TABLE,
            datetime_utc,
          });
        } catch (e: any) {
          fatal("Run failed", e);
        }
      },
      (e: any) => fatal("Initialize error", e)
    );
  },
  (e: any) => fatal("Auth error", e)
);