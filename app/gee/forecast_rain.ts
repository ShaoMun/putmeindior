import ee from "@google/earthengine";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

// Polling config
const POLL_EVERY_MS = 10_000; // 10s
const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes
const PRINT_FULL_STATUS_EACH_POLL = true;

// ----------------------------
// Logging / Helpers
// ----------------------------
function header(title: string) {
    console.log("\n" + title);
    console.log("-".repeat(title.length));
}

function log(msg: string) {
    console.log(" " + msg);
}

function warn(msg: string) {
    console.log(" ⚠️ " + msg);
}

function error(msg: string, err?: any) {
    console.log(" ❌ " + msg);
    if (err) console.error(err);
}

function fatal(msg: string, err?: any) {
    console.log("ERROR: " + msg);
    if (err) console.error(err);
    process.exit(1);
}

function toUtcStampParts() {
    const iso = new Date().toISOString();
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

async function getTaskStatusAsync(taskId: string): Promise<any> {
    return new Promise((resolve, reject) => {
        ee.data.getTaskStatus(taskId, (statusList: any, err: any) => {
            if (err) return reject(err);
            const s = Array.isArray(statusList) ? statusList[0] : statusList;
            resolve(s);
        });
    });
}

function fmtMs(ms?: number) {
    if (!ms) return "n/a";
    return new Date(ms).toISOString();
}

function resolveTaskId(task: any): string | null {
    return task?.id || task?.config?.id || task?._taskId || null;
}

// ----------------------------
// Main
// ----------------------------
header("Rain Forecast to BigQuery");

const { datetime_utc, date_utc, time_utc } = toUtcStampParts();
log(`Run time (UTC): ${datetime_utc}`);

ee.data.authenticateViaPrivateKey(
    privateKey,
    () => {
        ee.initialize(
            null,
            null,
            async () => {
                try {
                    log(`AOI: ${STATE}, ${COUNTRY}`);

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

                    log("Sample rows:");
                    for (const r of rows) {
                        log(
                            `grid_id=${r.grid_id} lat=${r.centroid_lat.toFixed(
                                5
                            )} lon=${r.centroid_lon.toFixed(5)} precip24h=${r.precip_24h_mm.toFixed(
                                2
                            )}mm precip72h=${r.precip_72h_mm.toFixed(2)}mm`
                        );
                    }

                    log("Converting to FeatureCollection...");
                    const features = rows.map((r) => {
                        return ee.Feature(ee.Geometry.Point([r.centroid_lon, r.centroid_lat]), {
                            grid_id: r.grid_id,
                            centroid_lat: r.centroid_lat,
                            centroid_lon: r.centroid_lon,
                            precip_24h_mm: r.precip_24h_mm,
                            precip_72h_mm: r.precip_72h_mm,
                            datetime_utc,
                            date_utc,
                            time_utc,
                        });
                    });
                    const collection = ee.FeatureCollection(features);

                    // ----------------------------
                    // Export to BigQuery (FULL STATUS + POLLING)
                    // ----------------------------
                    header("Export to BigQuery (with live status)");

                    const bqTable = `${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}`;

                    log(`[${nowIso()}] Preparing export...`);
                    log(`  Project        : ${BQ_PROJECT}`);
                    log(`  Dataset        : ${BQ_DATASET}`);
                    log(`  Table          : ${BQ_TABLE}`);
                    log(`  Full table ref : ${bqTable}`);
                    log(`  Submit time UTC: ${datetime_utc}`);

                    log(`[${nowIso()}] Creating export task...`);
                    const task = ee.batch.Export.table.toBigQuery({
                        collection: collection,
                        description: BQ_TABLE,
                        table: bqTable,
                        overwrite: true,
                        append: false,
                    });

                    log(`[${nowIso()}] Starting task...`);
                    task.start();

                    const taskId = resolveTaskId(task);
                    if (!taskId) {
                        error("Failed to resolve Earth Engine task ID after start()");
                        console.error(task);
                        process.exit(1);
                    }

                    log(`[${nowIso()}] Task ID resolved: ${taskId}`);
                    log("Now polling status until COMPLETED / FAILED / CANCELLED...");

                    let lastState: string | undefined;
                    const started = Date.now();

                    while (true) {
                        const elapsed = Date.now() - started;
                        if (elapsed > MAX_WAIT_MS) {
                            error(`Timed out after ${(MAX_WAIT_MS / 60000).toFixed(0)} mins`);
                            process.exit(1);
                        }

                        let s: any;
                        try {
                            s = await getTaskStatusAsync(taskId);
                        } catch (e: any) {
                            error(`[${nowIso()}] Failed to fetch task status`, e);
                            await sleep(POLL_EVERY_MS);
                            continue;
                        }

                        const state = s?.state ?? "UNKNOWN";

                        if (state !== lastState) {
                            log(`[${nowIso()}] State change: ${lastState ?? "∅"} → ${state}`);
                            lastState = state;
                        } else {
                            log(`[${nowIso()}] Poll: state=${state} (${(elapsed / 1000).toFixed(1)}s)`);
                        }

                        if (state === "COMPLETED") {
                            log(`[${nowIso()}] ✅ Task COMPLETED`);
                            log(`BigQuery table: ${bqTable}`);
                            process.exit(0);
                        }

                        if (state === "FAILED" || state === "CANCELLED") {
                            error(`[${nowIso()}] ❌ Task ${state}`);
                            if (s?.error_message) error(`Error message: ${s.error_message}`);
                            process.exit(1);
                        }

                        await sleep(POLL_EVERY_MS);
                    }
                } catch (e: any) {
                    fatal("Run failed", e);
                }
            },
            (e: any) => fatal("Initialize error", e)
        );
    },
    (e: any) => fatal("Auth error", e)
);
