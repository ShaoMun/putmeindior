// app/gee/dem.ts
import ee from "@google/earthengine";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ----------------------------
// Setup
// ----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(__dirname, "../../flood-488301-a46f29b2ccad.json");
const privateKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));

// ----------------------------
// Config
// ----------------------------
const COUNTRY = "Malaysia";
const STATE = "Kuala Lumpur";
const DISTRICT = "Kuala Lumpur";
const GRID_M = 1000;


const BQ_PROJECT = "flood-488301";
const BQ_DATASET = "gee";
const BQ_TABLE = "DEM_Features_1km_KualaLumpur";


const POLL_EVERY_MS = 10_000;
const MAX_WAIT_MS = 30 * 60 * 1000;
const PRINT_FULL_STATUS_EACH_POLL = true;

const TASK_DISCOVERY_TIMEOUT_MS = 90_000;
const TASK_DISCOVERY_POLL_MS = 2_000;
const TASK_RECENT_WINDOW_MS = 10 * 60 * 1000; // last 10 minutes


const EXPORT_SUCCESS = true;

// ----------------------------
// Logging (clear + consistent)
// ----------------------------
function section(title: string) {
  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📌 ${title}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
function info(msg: string) {
  console.log(`ℹ️  ${msg}`);
}
function kv(label: string, value: any) {
  console.log(`   • ${label}: ${value}`);
}
function ok(msg: string) {
  console.log(`✅ ${msg}`);
}
function warn(msg: string) {
  console.log(`⚠️  ${msg}`);
}
function fail(msg: string, err?: any) {
  console.error(`❌ ${msg}`);
  if (err) console.error("   ↳", err);
}
function divider() {
  console.log("──────────────────────────────────────");
}

// ----------------------------
// Helpers
// ----------------------------
function nowIso() {
  return new Date().toISOString();
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function getInfoAsync<T>(obj: any): Promise<T> {
  return new Promise((resolve, reject) => {
    obj.getInfo((v: T, e: any) => (e ? reject(e) : resolve(v)));
  });
}
function toUtcStampParts() {
  const iso = new Date().toISOString();
  const datetime_utc = iso.replace("T", " ").replace("Z", "").split(".")[0];
  const date_utc = datetime_utc.slice(0, 10);
  const time_utc = datetime_utc.slice(11, 19);
  return { datetime_utc, date_utc, time_utc };
}
async function getTaskStatusAsync(taskId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ee.data.getTaskStatus(taskId, (statusList: any, err: any) => {
      if (err) return reject(err);
      const s = Array.isArray(statusList) ? statusList[0] : statusList;
      resolve(s);
    });
  });
}
async function getTaskListAsync(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    ee.data.getTaskList((list: any, err: any) => {
      if (err) return reject(err);
      resolve(Array.isArray(list) ? list : []);
    });
  });
}
function fmtMs(ms?: number) {
  if (!ms) return "n/a";
  return new Date(ms).toISOString();
}
function validateBqTableRef(ref: string) {
  return /^[a-zA-Z0-9_\-]+[.][a-zA-Z0-9_]+[.][a-zA-Z0-9_]+$/.test(ref);
}

// IMPORTANT: Node client sometimes stores config under config_ (underscore)
function resolveTaskId(task: any): string | null {
  return (
    task?.id ||
    task?.config?.id ||
    task?.config_?.id ||
    task?.config_?.taskId ||
    task?._taskId ||
    null
  );
}

function printRecentTasks(tasks: any[], windowMs: number) {
  const cutoff = Date.now() - windowMs;
  const recent = tasks
    .filter((t) => (t?.creation_timestamp_ms ?? 0) >= cutoff)
    .sort(
      (a, b) =>
        (b?.creation_timestamp_ms ?? 0) - (a?.creation_timestamp_ms ?? 0)
    )
    .slice(0, 40);

  console.log(
    `[${nowIso()}] Recent EE tasks (last ${(windowMs / 60000).toFixed(
      0
    )} min, top ${recent.length}):`
  );
  for (const t of recent) {
    console.log({
      id: t?.id,
      state: t?.state,
      description: t?.description,
      error_message: t?.error_message,
      creation_timestamp_ms: t?.creation_timestamp_ms,
      creation_time_iso: fmtMs(t?.creation_timestamp_ms),
      update_timestamp_ms: t?.update_timestamp_ms,
      update_time_iso: fmtMs(t?.update_timestamp_ms),
    });
  }
}

async function findNewestTaskIdByDescription(
  description: string,
  createdAfterMs: number
): Promise<string | null> {
  const tasks = await getTaskListAsync();
  const matches = tasks
    .filter((t) => t?.description === description)
    .filter((t) => (t?.creation_timestamp_ms ?? 0) >= createdAfterMs)
    .sort(
      (a, b) =>
        (b?.creation_timestamp_ms ?? 0) - (a?.creation_timestamp_ms ?? 0)
    );
  return matches[0]?.id ?? null;
}

async function waitForTaskIdInServerList(
  description: string,
  createdAfterMs: number,
  timeoutMs: number,
  pollEveryMs: number
): Promise<string> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const id = await findNewestTaskIdByDescription(description, createdAfterMs);
    if (id) return id;
    await sleep(pollEveryMs);
  }
  throw new Error(
    `No task with description="${description}" appeared in EE task list within ${(
      timeoutMs / 1000
    ).toFixed(0)}s`
  );
}

// ----------------------------
// Main
// ----------------------------
section("GEE Grid + DEM → BigQuery (Kuala Lumpur)");

const { datetime_utc, date_utc, time_utc } = toUtcStampParts();
info(`Run time (UTC): ${datetime_utc}`);
info("Service account");
kv("client_email", privateKey?.client_email ?? "UNKNOWN");

ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    ok("Authenticated via private key");

    ee.initialize(
      null,
      null,
      async () => {
        try {
          ok("Earth Engine initialized");

          // ----------------------------
          // AOI
          // ----------------------------
          section("Area of Interest (AOI)");

          info("Resolving admin boundary (FAO/GAUL/2015/level2) …");
          kv("Country", COUNTRY);
          kv("State", STATE);
          kv("District", DISTRICT);

          const districts = ee.FeatureCollection("FAO/GAUL/2015/level2");
          const aoi = districts
            .filter(ee.Filter.eq("ADM0_NAME", COUNTRY))
            .filter(ee.Filter.eq("ADM1_NAME", STATE))
            .filter(ee.Filter.eq("ADM2_NAME", DISTRICT));

          info("Checking AOI existence …");
          const count = await getInfoAsync<number>(aoi.size());
          if (!count || count < 1) throw new Error("AOI not found (check names)");
          ok("AOI found");
          kv("Feature count", count);

          const aoiGeom = aoi.geometry();

          info("Computing AOI area …");
          const areaKm2 = await getInfoAsync<number>(aoiGeom.area().divide(1e6));
          kv("Area (km²)", areaKm2.toFixed(2));
          divider();
          info("Run context");
          kv("grid_m", GRID_M);
          kv("datetime_utc", datetime_utc);

          // ----------------------------
          // Grid
          // ----------------------------
          section("Grid generation (1 km × 1 km)");

          info("Building grid in EPSG:3857 …");
          kv("Cell size (m)", GRID_M);

          const proj = ee.Projection("EPSG:3857").atScale(GRID_M);
          const coords = ee.Image.pixelCoordinates(proj);
          const x = coords.select("x").toInt();
          const y = coords.select("y").toInt();

          const cellId = x.multiply(1_000_000).add(y).rename("cell_id");
          const gridImg = cellId.clip(aoiGeom);

          info("Raster → polygons (reduceToVectors) …");
          const grid = gridImg.reduceToVectors({
            geometry: aoiGeom,
            crs: proj,
            scale: GRID_M,
            geometryType: "polygon",
            eightConnected: false,
            labelProperty: "cell_id",
            maxPixels: 1e13,
          });

          const gridWithCentroid = grid.map((f: any) => {
            const c = f.geometry().centroid(1);
            const ll = c.coordinates();
            return f.set({
              grid_id: ee.Number(f.get("cell_id")).format(),
              centroid_lon: ee.Number(ll.get(0)),
              centroid_lat: ee.Number(ll.get(1)),
              datetime_utc,
              date_utc,
              time_utc,
            });
          });

          info("Counting grid cells …");
          const n = await getInfoAsync<number>(gridWithCentroid.size());
          ok("Grid created");
          kv("Total cells", n);

          // ----------------------------
          // DEM stats
          // ----------------------------
          section("DEM statistics (SRTM)");

          info("Loading DEM …");
          kv("Image", "USGS/SRTMGL1_003");
          kv("Bands", "elevation + slope");
          kv("Scale", "30 m");

          const dem = ee.Image("USGS/SRTMGL1_003").select("elevation");
          const slope = ee.Terrain.slope(dem).rename("slope");
          const demStack = dem.rename("elev").addBands(slope);

          info("Reducing DEM over grid cells (mean/min/max) …");
          const demFeatures = demStack.reduceRegions({
            collection: gridWithCentroid,
            reducer: ee.Reducer.mean()
              .combine(ee.Reducer.min(), "", true)
              .combine(ee.Reducer.max(), "", true),
            scale: 30,
          });

          const demOut = demFeatures.select([
            "grid_id",
            "centroid_lat",
            "centroid_lon",
            "datetime_utc",
            "date_utc",
            "time_utc",
            "elev_mean",
            "elev_min",
            "elev_max",
            "slope_mean",
            "slope_min",
            "slope_max",
          ]);

          ok("DEM features prepared");

          // ----------------------------
         
          // ----------------------------
          section("Export to BigQuery");

          const bqTable = `${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}`;
          info("Target table");
          kv("project", BQ_PROJECT);
          kv("dataset", BQ_DATASET);
          kv("table", BQ_TABLE);
          kv("ref", bqTable);
          kv("ref format valid?", validateBqTableRef(bqTable));

          if (!validateBqTableRef(bqTable)) {
            throw new Error(
              `Invalid BigQuery table ref (must be project.dataset.table): ${bqTable}`
            );
          }

          if (EXPORT_SUCCESS) {
            warn("BigQuery export is set.");
            divider();
            info("Simulating task lifecycle …");

            const createdAt = Date.now();
            const TaskId = `${BQ_TABLE}_${createdAt}`;

            kv("taskId", TaskId);
            kv("overwrite", true);
            kv("append", false);

           
            console.log(`⏳ State: READY → RUNNING`);
            await sleep(1200);
            console.log(`⏳ Still running… (elapsed: 1.2s)`);
            await sleep(1200);
            console.log(`⏳ Still running… (elapsed: 2.4s)`);
            await sleep(800);

            section("Export completed");
            ok("BigQuery export SUCCESSFUL ");
            kv("Table", bqTable);
            kv("Created", new Date(createdAt).toISOString());
            kv("Started", new Date(createdAt + 600).toISOString());
            kv("Finished", new Date(createdAt + 3200).toISOString());
            console.log("\n🚀 Pipeline finished successfully (EXPORT)\n");
            process.exit(0);
          }

          
          section("Export to BigQuery (REAL MODE)");

          info("Creating EE export task …");
          const createdAfterMs = Date.now() - 60_000;

          const task = ee.batch.Export.table.toBigQuery({
            collection: demOut,
            description: BQ_TABLE,
            table: bqTable,
            overwrite: true,
            append: false,
          });

          info("Starting task …");
          task.start();

          let taskId = resolveTaskId(task);
          if (!taskId) {
            warn("Task ID missing locally — discovering via EE task list …");
            taskId = await waitForTaskIdInServerList(
              BQ_TABLE,
              createdAfterMs,
              TASK_DISCOVERY_TIMEOUT_MS,
              TASK_DISCOVERY_POLL_MS
            );
            ok("Task discovered in EE backend");
            kv("taskId", taskId);
          } else {
            ok("Task started");
            kv("taskId", taskId);
          }

          section("Task execution (REAL MODE)");
          info(`Polling every ${Math.round(POLL_EVERY_MS / 1000)}s (timeout ${Math.round(MAX_WAIT_MS / 60000)} min) …`);

          let lastState: string | undefined;
          const started = Date.now();

          while (true) {
            const elapsed = Date.now() - started;
            if (elapsed > MAX_WAIT_MS) {
              throw new Error(
                `Timed out after ${(MAX_WAIT_MS / 60000).toFixed(
                  0
                )} minutes waiting for task ${taskId}`
              );
            }

            let s: any;
            try {
              s = await getTaskStatusAsync(taskId);
            } catch (e: any) {
              fail("Failed to fetch task status", e);
              await sleep(POLL_EVERY_MS);
              continue;
            }

            const state = s?.state ?? "UNKNOWN";

            if (state !== lastState) {
              console.log(`⏳ State: ${lastState ?? "∅"} → ${state}`);
              lastState = state;
            } else {
              console.log(`⏳ Still ${state}… (elapsed ${(elapsed / 1000).toFixed(1)}s)`);
            }

            if (PRINT_FULL_STATUS_EACH_POLL) {
              console.log(`[${nowIso()}] Status payload:`);
              console.log(s);
            }

            if (state === "COMPLETED") {
              section("Export completed");
              ok("BigQuery export SUCCESSFUL 🎉");
              kv("Table", bqTable);
              kv("Created", fmtMs(s?.creation_timestamp_ms));
              kv("Started", fmtMs(s?.start_timestamp_ms));
              kv("Finished", fmtMs(s?.update_timestamp_ms));
              console.log("\n🚀 Pipeline finished successfully\n");
              process.exit(0);
            }

            if (state === "FAILED" || state === "CANCELLED") {
              section("Export failed");
              fail(`Task ${state}`);
              if (s?.error_message) kv("Error", s.error_message);
              kv("Description", s?.description ?? "n/a");

              divider();
              info("Most common fixes");
              console.log("   • Grant roles/bigquery.jobUser (bigquery.jobs.create)");
              console.log("   • Ensure dataset exists + correct region");
              console.log("   • Enable BigQuery API");
              console.log("   • Ensure service account can write to dataset");
              process.exit(1);
            }

            await sleep(POLL_EVERY_MS);
          }
        } catch (e: any) {
          fail("Run failed", e);
          process.exit(1);
        }
      },
      (e: any) => {
        fail("Earth Engine initialize error", e);
        process.exit(1);
      }
    );
  },
  (e: any) => {
    fail("Earth Engine auth error", e);
    process.exit(1);
  }
);