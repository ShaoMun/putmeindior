// rain_forecast_grid_export.ts
// Real-time forecast → 1km grid over Kuala Lumpur → export to GCS (load to BigQuery)

import ee from "@google/earthengine";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- CONFIG ----------
const keyPath = path.join(__dirname, "../../flood-488301-a46f29b2ccad.json");

// AOI: Kuala Lumpur (GAUL level 2)
const COUNTRY = "Malaysia";
const STATE = "Kuala Lumpur";
const DISTRICT = "Kuala Lumpur";

// Grid
const GRID_KM = 1;
const GRID_M = GRID_KM * 1000;

// Export to GCS (then load to BigQuery)
const GCS_BUCKET = "YOUR_GCS_BUCKET_NAME";            // <-- change
const FILE_PREFIX = "rain_forecast/kl_1km_gfs";       // <-- change
const EXPORT_DESCRIPTION = "KL_RainForecast_1km_GFS"; // <-- change
// ----------------------------

// Logging helpers
function header(title: string) {
  console.log("\n" + title);
  console.log("-".repeat(title.length));
}
function log(msg: string) {
  console.log(msg);
}
function fatal(msg: string, e?: any) {
  console.log("ERROR: " + msg);
  if (e) console.error(e);
  process.exit(1);
}

header("Rain Forecast → 1km Grid → Export (GCS → BigQuery)");

// Service account key
const privateKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));

ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    ee.initialize(
      null,
      null,
      async () => {
        try {
          // -----------------------------
          // 1) AOI from GAUL Level 2
          // -----------------------------
          const gaul2 = ee.FeatureCollection("FAO/GAUL/2015/level2");

          const aoi = gaul2
            .filter(ee.Filter.eq("ADM0_NAME", COUNTRY))
            .filter(ee.Filter.eq("ADM1_NAME", STATE))
            .filter(ee.Filter.eq("ADM2_NAME", DISTRICT))
            .geometry();

          // -----------------------------
          // 2) Build a 1km grid over AOI
          //    (rectangular cells, keep only those intersecting AOI)
          // -----------------------------
          const bounds = aoi.bounds(1);
          const proj = ee.Projection("EPSG:3857").atScale(GRID_M);

          // Create an image with unique IDs per pixel at the desired scale
          // Then reduceToVectors to create polygons (cells).
          const gridImg = ee.Image.random().multiply(1e9).toInt().rename("cell_id").reproject(proj);

          let grid = gridImg.reduceToVectors({
            geometry: bounds,
            scale: GRID_M,
            geometryType: "polygon",
            labelProperty: "cell_id",
            bestEffort: true,
            maxPixels: 1e13,
            tileScale: 4,
          });

          // Keep only cells that intersect AOI, clip to AOI footprint if you want
          grid = grid.filterBounds(aoi);

          // Add centroid + stable string grid_id
          grid = grid.map((f: ee.Feature) => {
            const c = f.geometry().centroid(1);
            return f.set({
              grid_id: ee.String(f.get("cell_id")), // consistent STRING id
              centroid_lon: ee.Number(c.coordinates().get(0)),
              centroid_lat: ee.Number(c.coordinates().get(1)),
            });
          });

          // -----------------------------
          // 3) Get latest GFS forecast
          //    Dataset: NOAA/GFS0P25 (commonly available in EE)
          // -----------------------------
          // We take the latest model run available and compute sums for
          // forecast hours 0..24 and 0..72.
          const gfs = ee.ImageCollection("NOAA/GFS0P25")
            .filterBounds(aoi)
            .sort("system:time_start", false);

          const latest = ee.Image(gfs.first());

          // Many GFS images have bands like "total_precipitation_surface"
          // If band name differs, the script will fail—adjust BAND below if needed.
          const BAND = "total_precipitation_surface";

          // Helper: sum precip for forecast hours [startHour, endHour)
          // The collection has a "forecast_hours" property on images in many GFS EE ingests.
          // If your EE version uses a different property name, adjust FORECAST_PROP.
          const FORECAST_PROP = "forecast_hours";

          function sumForecastHours(startHour: number, endHour: number) {
            const subset = gfs
              .filter(ee.Filter.gte(FORECAST_PROP, startHour))
              .filter(ee.Filter.lt(FORECAST_PROP, endHour))
              // keep only images from the same model run time as `latest`
              .filter(ee.Filter.eq("system:time_start", latest.get("system:time_start")));

            // Sum the band across forecast steps
            // (units depend on ingest; commonly kg/m^2 ~= mm for water)
            return subset.select([BAND]).sum().rename(`precip_${endHour - startHour}h_mm`);
          }

          const precip24 = sumForecastHours(0, 24);  // 0–24h accumulation
          const precip72 = sumForecastHours(0, 72);  // 0–72h accumulation

          // Combine as one image for sampling
          const precipImg = precip24.addBands(precip72);

          // -----------------------------
          // 4) Reduce over each grid cell (mean precip within cell)
          // -----------------------------
          // Note: GFS is coarse; mean is fine. Use scale ~ 10km to match coarse data.
          // If you set scale to 1000, EE will do extra work for no benefit with coarse grids.
          const SAMPLE_SCALE_M = 10000;

          const withPrecip = precipImg.reduceRegions({
            collection: grid,
            reducer: ee.Reducer.mean(),
            scale: SAMPLE_SCALE_M,
            tileScale: 4,
          });

          // -----------------------------
          // 5) Clean schema (avoid null-only / mixed types)
          //    Ensure precip fields are always numbers (fill nulls)
          // -----------------------------
          const cleaned = withPrecip.map((f: ee.Feature) => {
            const p24 = ee.Number(ee.Algorithms.If(f.get("precip_24h_mm_mean"), f.get("precip_24h_mm_mean"), -9999));
            const p72 = ee.Number(ee.Algorithms.If(f.get("precip_72h_mm_mean"), f.get("precip_72h_mm_mean"), -9999));

            // Keep only the columns you actually want exported (prevents “mystery null columns”)
            return ee.Feature(null, {
              grid_id: ee.String(f.get("grid_id")),
              centroid_lat: ee.Number(f.get("centroid_lat")),
              centroid_lon: ee.Number(f.get("centroid_lon")),
              precip_24h_mm: p24,
              precip_72h_mm: p72,
              // Add run time metadata if you want:
              model_time_millis: ee.Number(latest.get("system:time_start")),
            });
          });

          // -----------------------------
          // 6) Export to GCS as CSV (best for BigQuery)
          // -----------------------------
          const task = (ee as any).batch.Export.table.toCloudStorage({
            collection: cleaned,
            description: EXPORT_DESCRIPTION,
            bucket: GCS_BUCKET,
            fileNamePrefix: FILE_PREFIX,
            fileFormat: "CSV",
          });

          task.start();

          log("✅ Started export task");
          log(`   Task id: ${task.id}`);
          log(`   Output: gs://${GCS_BUCKET}/${FILE_PREFIX}.csv`);
          log("");
          log("BigQuery load tip:");
          log(`- Source: gs://${GCS_BUCKET}/${FILE_PREFIX}*.csv`);
          log("- Format: CSV");
          log("- Skip header rows: 1");
          log("- Autodetect schema: ON (or set schema explicitly)");

        } catch (e: any) {
          fatal("Pipeline failed", e);
        }
      },
      (e: any) => fatal("Initialize error", e)
    );
  },
  (e: any) => fatal("Auth error", e)
);