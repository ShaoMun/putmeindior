import ee from "@google/earthengine";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================
// MODE
// ============================
// true  = friendlier flow (does not crash if imagery is missing)
// false = strict behavior (errors stop the flow)
const PROTOTYPE_MODE = true;

// ============================
// ESM-safe __dirname
// ============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================
// Service account key
// ============================
const keyPath = path.join(__dirname, "../../flood-488301-a46f29b2ccad.json");
const privateKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));

// ============================
// CONFIG (Kuala Lumpur)
// ============================
const COUNTRY = "Malaysia";
const STATE = "Kuala Lumpur";
const DISTRICT = "Kuala Lumpur";

const GRID_M = 1000;

const AFTER_WINDOWS = [14, 30, 60, 90];
const BEFORE_DAYS = 30;
const BEFORE_GAP_DAYS = 3;

const THRESHOLD = 0.7;

const SLOPE_MAX_DEG = 5;
const PERM_WATER_OCCURRENCE = 90;

const SMOOTH_RADIUS_M = 30;

// If flooded area in a 1km cell >= this => flood_label=1 else 0
const FLOOD_LABEL_MIN_M2 = 10_000;

// Demo date to force specific periods. Set null for live.
const DEMO_DATE_UTC: string | null = "2021-12-20";
// const DEMO_DATE_UTC: string | null = null;

const ORBITS: ("DESCENDING" | "ASCENDING")[] = ["DESCENDING", "ASCENDING"];

// ============================
// Human-readable logging (light emojis)
// ============================
function step(msg: string) {
  console.log(`\n🚀 ${msg}`);
}
function info(msg: string) {
  console.log(`   ${msg}`);
}
function success(msg: string) {
  console.log(`   ✅ ${msg}`);
}
function warning(msg: string) {
  console.log(`   ⚠️  ${msg}`);
}
function fatal(msg: string, err?: any): never {
  console.error(`\n❌ ERROR: ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

// ============================
// Time helpers
// ============================
function nowIso() {
  return new Date().toISOString();
}
function toMalaysiaTime(isoUtc: string) {
  const d = new Date(isoUtc);
  const ms = d.getTime() + 8 * 60 * 60 * 1000;
  return new Date(ms).toISOString().replace("Z", "+08:00");
}

// ============================
// SAR helpers
// ============================
function dbToLinear(img: any) {
  return ee.Image(10).pow(ee.Image(img).divide(10));
}

function s1Collection(
  aoiGeom: any,
  start: any,
  end: any,
  orbitPass: "ASCENDING" | "DESCENDING"
) {
  return ee
    .ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(aoiGeom)
    .filterDate(start, end)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.eq("orbitProperties_pass", orbitPass))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .filter(ee.Filter.eq("resolution_meters", 10))
    .select("VV");
}

function buildGrid(aoiGeom: any) {
  const proj = ee.Projection("EPSG:3857").atScale(GRID_M);

  const coords = ee.Image.pixelCoordinates(proj);
  const x = coords.select("x").toInt();
  const y = coords.select("y").toInt();
  const cellId = x.multiply(1_000_000).add(y).rename("cell_id");

  const cellImg = cellId.clip(aoiGeom);

  const gridFc = cellImg.reduceToVectors({
    geometry: aoiGeom,
    crs: proj,
    scale: GRID_M,
    geometryType: "polygon",
    eightConnected: false,
    labelProperty: "cell_id",
    maxPixels: 1e13,
  });

  return gridFc.map((f: any) => {
    const c = f.geometry().centroid(1);
    const ll = c.coordinates(); // [lon, lat]
    return f.set({
      grid_id: ee.Number(f.get("cell_id")).format(),
      centroid_lon: ee.Number(ll.get(0)),
      centroid_lat: ee.Number(ll.get(1)),
    });
  });
}

function findAfterImage(
  aoiGeom: any,
  endDate: any,
  done: (result: {
    afterImgDb: any;
    afterCount: number;
    usedDays: number;
    usedOrbit: "ASCENDING" | "DESCENDING";
  }) => void,
  failAll: () => void
) {
  let wi = 0;
  let oi = 0;

  function tryNext() {
    if (wi >= AFTER_WINDOWS.length) return failAll();
    if (oi >= ORBITS.length) {
      wi += 1;
      oi = 0;
      return tryNext();
    }

    const usedDays = AFTER_WINDOWS[wi];
    const usedOrbit = ORBITS[oi];
    const afterStart = endDate.advance(-usedDays, "day");

    info(`🛰️ Searching Sentinel-1: last ${usedDays} days (${usedOrbit.toLowerCase()} orbit)`);

    const col = s1Collection(aoiGeom, afterStart, endDate, usedOrbit);

    col.size().getInfo((n: number, e: any) => {
      if (e) {
        warning(`Search failed (${usedDays} days, ${usedOrbit.toLowerCase()}). Trying next…`);
        oi += 1;
        return tryNext();
      }
      if (!n || n < 1) {
        warning(`No images (${usedDays} days, ${usedOrbit.toLowerCase()}). Trying next…`);
        oi += 1;
        return tryNext();
      }

      const afterImgDb = ee.Image(col.sort("system:time_start", false).first());
      done({ afterImgDb, afterCount: n, usedDays, usedOrbit });
    });
  }

  tryNext();
}

// ============================
// MAIN
// ============================
step("Starting SAR flood detection");
info(`📍 Area: ${DISTRICT}, ${STATE}, ${COUNTRY}`);
info(`🕒 Run time (UTC): ${nowIso()}`);
info(`🧩 Grid size: ${GRID_M / 1000} km`);
info(`🌊 Flood threshold: ratio < ${THRESHOLD}`);
info(`🏷️  Label rule: flooded area ≥ ${FLOOD_LABEL_MIN_M2.toLocaleString()} m² → flood_label = 1 (else 0)`);
if (DEMO_DATE_UTC) info(`📅 Fixed end date (UTC): ${DEMO_DATE_UTC}`);
info(`🧪 Mode: ${DEMO_DATE_UTC ? "fixed date" : "live date"}${PROTOTYPE_MODE ? " (safe mode)" : ""}`);

ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    ee.initialize(
      null,
      null,
      () => {
        success("Earth Engine initialized");

        step("Loading area boundary");
        const districts = ee.FeatureCollection("FAO/GAUL/2015/level2");
        const aoi = districts
          .filter(ee.Filter.eq("ADM0_NAME", COUNTRY))
          .filter(ee.Filter.eq("ADM1_NAME", STATE))
          .filter(ee.Filter.eq("ADM2_NAME", DISTRICT));

        aoi.size().getInfo((count: number, e0: any) => {
          if (e0) return fatal("Cannot read area boundary", e0);
          if (!count || count < 1) return fatal("Area not found. Check spelling.");

          success(`Area loaded (${count} feature${count > 1 ? "s" : ""})`);

          const aoiGeom = aoi.geometry();

          step("Calculating area size");
          aoiGeom
            .area()
            .divide(1e6)
            .getInfo((areaKm2: number, e1: any) => {
              if (e1) return fatal("Cannot calculate area size", e1);
              success(`Area size: ${areaKm2.toFixed(2)} km²`);

              step("Building analysis grid (1 km)");
              const grid = buildGrid(aoiGeom);

              grid.size().getInfo((n: number, e2: any) => {
                if (e2) return fatal("Grid creation failed", e2);
                success(`Created ${n} grid cells`);

                step("Selecting Sentinel-1 imagery");
                const endDate = DEMO_DATE_UTC ? ee.Date(DEMO_DATE_UTC) : ee.Date(Date.now());
                if (!DEMO_DATE_UTC) info("📅 Using current date as end date");

                findAfterImage(
                  aoiGeom,
                  endDate,
                  ({ afterImgDb, afterCount, usedDays, usedOrbit }) => {
                    success(`Selected imagery: last ${usedDays} days (${usedOrbit.toLowerCase()} orbit)`);
                    info(`🧾 Images found in selection window: ${afterCount}`);

                    afterImgDb.get("system:time_start").getInfo((t: number, e3: any) => {
                      if (!e3 && t) {
                        const utcIso = new Date(t).toISOString();
                        info(`🕒 Latest acquisition (UTC): ${utcIso}`);
                        info(`🕗 Latest acquisition (MYT): ${toMalaysiaTime(utcIso)}`);
                      }
                    });

                    const afterStart = endDate.advance(-usedDays, "day");
                    const beforeEnd = afterStart.advance(-BEFORE_GAP_DAYS, "day");
                    const beforeStart = beforeEnd.advance(-BEFORE_DAYS, "day");

                    step("Loading baseline images for comparison");
                    info(`Baseline window: ${BEFORE_DAYS} days (gap: ${BEFORE_GAP_DAYS} days)`);

                    const beforeCol = s1Collection(aoiGeom, beforeStart, beforeEnd, usedOrbit);

                    beforeCol.size().getInfo((beforeCount: number, e4: any) => {
                      if (e4) return fatal("Cannot load baseline images", e4);

                      if (!beforeCount || beforeCount < 1) {
                        if (!PROTOTYPE_MODE) return fatal("No baseline images found. Increase BEFORE_DAYS.");

                        warning("No baseline images found. Skipping flood detection (safe mode).");
                        success("Run finished safely.");
                        return;
                      }

                      success(`Baseline images found: ${beforeCount}`);

                      step("Detecting flooded areas from SAR ratio");
                      info(`Smoothing radius: ${SMOOTH_RADIUS_M} m`);
                      info(`Slope mask: < ${SLOPE_MAX_DEG}°`);
                      info(`Exclude permanent water: occurrence > ${PERM_WATER_OCCURRENCE}%`);

                      const beforeImgDb = ee.Image(beforeCol.median());

                      const afterLin = dbToLinear(afterImgDb).focal_median({
                        radius: SMOOTH_RADIUS_M,
                        units: "meters",
                      });
                      const beforeLin = dbToLinear(beforeImgDb).focal_median({
                        radius: SMOOTH_RADIUS_M,
                        units: "meters",
                      });

                      const ratio = afterLin.divide(beforeLin).rename("ratio");
                      const floodRaw = ratio.lt(THRESHOLD).rename("flood").selfMask();

                      const dem = ee.Image("USGS/SRTMGL1_003");
                      const slope = ee.Terrain.slope(dem);
                      const slopeMask = slope.lt(SLOPE_MAX_DEG);

                      const gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater");
                      const permanentWater = gsw.select("occurrence").gt(PERM_WATER_OCCURRENCE);

                      const floodMask = floodRaw.updateMask(slopeMask).updateMask(permanentWater.not());

                      step("Estimating total flooded area");
                      const floodAreaAOI = ee.Image.pixelArea()
                        .updateMask(floodMask)
                        .reduceRegion({
                          reducer: ee.Reducer.sum(),
                          geometry: aoiGeom,
                          scale: 10,
                          maxPixels: 1e13,
                        });

                      floodAreaAOI.getInfo((res: any, e5: any) => {
                        if (e5) return fatal("Failed to estimate flooded area", e5);

                        const floodedM2 = Number(res?.sum ?? 0);
                        const floodedKm2 = floodedM2 / 1_000_000;

                        success(
                          `Estimated flooded area: ${floodedKm2.toFixed(2)} km² (${Math.round(
                            floodedM2
                          ).toLocaleString()} m²)`
                        );

                        step("Assigning flood labels to grid cells ");
                        info("Calculating flooded area per grid cell…");

                        const floodAreaImg = ee.Image.pixelArea()
                          .updateMask(floodMask)
                          .rename("flooded_m2");

                        const gridFlood = floodAreaImg.reduceRegions({
                          collection: grid,
                          reducer: ee.Reducer.sum(),
                          scale: 10,
                        });

                        // IMPORTANT: NO .default() in Node EE client
                        const labeled = gridFlood.map((f: any) => {
                          const raw = f.get("sum"); // can be null
                          const m2 = ee.Number(ee.Algorithms.If(raw, raw, 0));
                          const label = m2.gte(FLOOD_LABEL_MIN_M2).int(); // strictly 0/1
                          return ee.Feature(f).set({
                            flooded_m2: m2,
                            flood_label: label,
                          });
                        });

                        labeled
                          .filter(ee.Filter.eq("flood_label", 1))
                          .size()
                          .getInfo((k: number, e6: any) => {
                            if (e6) return fatal("Failed to count flooded grid cells", e6);

                            success(`Flooded grid cells (label = 1): ${k} of ${n}`);
                            success("Flood labels generated successfully ✅");
                            step("Completed ");
                            success("Data is ready for export to BigQuery.");
                          });
                      });
                    });
                  },
                  () => {
                    if (!PROTOTYPE_MODE) return fatal("No satellite images found for any search window/orbit.");
                    warning("No satellite images found for any search window/orbit (safe mode).");
                    success("Run finished safely.");
                  }
                );
              });
            });
        });
      },
      (e: any) => fatal("Earth Engine initialization error", e)
    );
  },
  (e: any) => fatal("Earth Engine authentication error", e)
);