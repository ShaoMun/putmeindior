// app/gee/test_gee.ts
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

// ----------------------------
// Logging
// ----------------------------
function header(title: string) {
  console.log("\n" + title);
  console.log("─".repeat(title.length));
}
function log(msg: string) {
  console.log(" " + msg);
}
function error(msg: string, err?: any) {
  console.log(" ❌ " + msg);
  if (err) console.error(err);
}

// ----------------------------
// Helpers
// ----------------------------
function getInfoAsync<T>(obj: any): Promise<T> {
  return new Promise((resolve, reject) => {
    obj.getInfo((v: T, e: any) => {
      if (e) reject(e);
      else resolve(v);
    });
  });
}

function toUtcStampParts() {
  // ISO: 2026-02-25T08:14:32.123Z
  const iso = new Date().toISOString();
  const datetime_utc = iso.replace("T", " ").replace("Z", "").split(".")[0]; // "YYYY-MM-DD HH:mm:ss"
  const date_utc = datetime_utc.slice(0, 10);
  const time_utc = datetime_utc.slice(11, 19);
  return { datetime_utc, date_utc, time_utc };
}

// ----------------------------
// Main
// ----------------------------
header("GEE Grid Test (Kuala Lumpur)");

const { datetime_utc, date_utc, time_utc } = toUtcStampParts();
log(`Run time (UTC): ${datetime_utc}`);

ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    log("Authenticated via private key");

    ee.initialize(
      null,
      null,
      async () => {
        try {
          log("Earth Engine initialized");

          // ----------------------------
          // AOI
          // ----------------------------
          header("AOI");

          const districts = ee.FeatureCollection("FAO/GAUL/2015/level2");

          const aoi = districts
            .filter(ee.Filter.eq("ADM0_NAME", COUNTRY))
            .filter(ee.Filter.eq("ADM1_NAME", STATE))
            .filter(ee.Filter.eq("ADM2_NAME", DISTRICT));

          log("Fetching AOI size...");
          const count = await getInfoAsync<number>(aoi.size());
          if (!count || count < 1) {
            throw new Error(
              `AOI not found for ${DISTRICT}, ${STATE}, ${COUNTRY}. (count=${count})`
            );
          }
          log(`AOI: ${DISTRICT}, ${STATE}, ${COUNTRY} (features=${count})`);

          const aoiGeom = aoi.geometry();

          log("Computing AOI area...");
          const areaKm2 = await getInfoAsync<number>(aoiGeom.area().divide(1e6));
          log(`AOI area: ${areaKm2.toFixed(2)} km²`);

          // ----------------------------
          // Grid
          // ----------------------------
          header("Grid (1 km × 1 km)");

          const proj = ee.Projection("EPSG:3857").atScale(GRID_M);

          const coords = ee.Image.pixelCoordinates(proj);
          const x = coords.select("x").toInt();
          const y = coords.select("y").toInt();

          const cellId = x.multiply(1_000_000).add(y).rename("cell_id");
          const gridImg = cellId.clip(aoiGeom);

          log("Reducing to vectors (grid)...");
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
            const ll = c.coordinates(); // [lon, lat]
            return f.set({
              grid_id: ee.Number(f.get("cell_id")).format(),
              centroid_lon: ee.Number(ll.get(0)),
              centroid_lat: ee.Number(ll.get(1)),
              datetime_utc,
              date_utc,
              time_utc,
            });
          });

          log("Fetching grid cell count...");
          const n = await getInfoAsync<number>(gridWithCentroid.size());
          log(`Grid cells: ${n}`);

          // ----------------------------
          // Sample output
          // ----------------------------
          header("Sample grid cells (first 5)");

          const sample = gridWithCentroid
            .limit(5)
            .map((f: any) =>
              ee.Feature(
                null,
                f.toDictionary([
                  "grid_id",
                  "centroid_lat",
                  "centroid_lon",
                  "datetime_utc",
                  "date_utc",
                  "time_utc",
                ])
              )
            );

          log("Reading sample features...");
          const fc = await getInfoAsync<any>(sample);

          for (const feat of fc.features) {
            const p = feat.properties;
            log(
              `grid_id=${p.grid_id} lat=${Number(p.centroid_lat).toFixed(
                5
              )} lon=${Number(p.centroid_lon).toFixed(5)} datetime_utc=${
                p.datetime_utc
              }`
            );
          }

          log("Done export to big query successfully");
          process.exit(0);
        } catch (e: any) {
          error("Run failed", e);
          process.exit(1);
        }
      },
      (e: any) => {
        error("Earth Engine initialize error", e);
        process.exit(1);
      }
    );
  },
  (e: any) => {
    error("Earth Engine auth error", e);
    process.exit(1);
  }
);