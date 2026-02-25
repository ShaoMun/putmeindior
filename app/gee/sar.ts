
import ee from "@google/earthengine";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(__dirname, "../../flood-488301-a46f29b2ccad.json");
const privateKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));

// -------------------------
// CONFIG (Kuala Lumpur)
// -------------------------
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

// If flooded area in a 1km cell >= this => label=1
const FLOOD_LABEL_MIN_M2 = 10_000;

// Demo date to force “likely flood” periods. Set null for live.
const DEMO_DATE_UTC: string | null = "2021-12-20";
// const DEMO_DATE_UTC: string | null = null;

const ORBITS: ("DESCENDING" | "ASCENDING")[] = ["DESCENDING", "ASCENDING"];

// ----------------------------
// Logging (clean, light emoji)
// ----------------------------
function header(title: string) {
  console.log("\n" + title);
  console.log("─".repeat(title.length));
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

function toMalaysiaTime(isoUtc: string) {
  const d = new Date(isoUtc);
  const ms = d.getTime() + 8 * 60 * 60 * 1000;
  return new Date(ms).toISOString().replace("Z", "+08:00");
}

function dbToLinear(img: any) {
  return ee.Image(10).pow(ee.Image(img).divide(10));
}

function s1Collection(aoiGeom: any, start: any, end: any, orbitPass: "ASCENDING" | "DESCENDING") {
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

    log(`Searching: last ${usedDays} days (${usedOrbit})`);
    const col = s1Collection(aoiGeom, afterStart, endDate, usedOrbit);

    col.size().getInfo((n: number, e: any) => {
      if (e) {
        oi += 1;
        return tryNext();
      }
      if (!n || n < 1) {
        oi += 1;
        return tryNext();
      }
      const afterImgDb = ee.Image(col.sort("system:time_start", false).first());
      done({ afterImgDb, afterCount: n, usedDays, usedOrbit });
    });
  }

  tryNext();
}

// -------------------------
// MAIN
// -------------------------
header("SAR Flood Labels (Kuala Lumpur)");

ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    ee.initialize(
      null,
      null,
      () => {
        log("Earth Engine initialized");
        log(`AOI: ${DISTRICT}, ${STATE}, ${COUNTRY}`);

        if (DEMO_DATE_UTC) {
          header("🎯 Demo mode");
          log(`Using fixed date (UTC): ${DEMO_DATE_UTC}`);
        } else {
          header("🕒 Live mode");
          log("Using current date (may be dry)");
        }

        const districts = ee.FeatureCollection("FAO/GAUL/2015/level2");
        const aoi = districts
          .filter(ee.Filter.eq("ADM0_NAME", COUNTRY))
          .filter(ee.Filter.eq("ADM1_NAME", STATE))
          .filter(ee.Filter.eq("ADM2_NAME", DISTRICT));

        aoi.size().getInfo((count: number, e0: any) => {
          if (e0) return error("Cannot read AOI", e0);
          if (!count || count < 1) return error("AOI not found. Check spelling.");

          const aoiGeom = aoi.geometry();

          aoiGeom.area().divide(1e6).getInfo((areaKm2: number, e1: any) => {
            if (e1) return error("Cannot compute AOI area", e1);
            log(`AOI area: ${areaKm2.toFixed(2)} km²`);

            header("🧱 Grid");
            log("Building 1km x 1km grid ...");

            const grid = buildGrid(aoiGeom);

            grid.size().getInfo((n: number, e2: any) => {
              if (e2) return error("Grid creation failed", e2);
              log(`Grid cells: ${n}`);

              header("🛰️ Sentinel-1 imagery");

              const endDate = DEMO_DATE_UTC ? ee.Date(DEMO_DATE_UTC) : ee.Date(Date.now());

              findAfterImage(
                aoiGeom,
                endDate,
                ({ afterImgDb, afterCount, usedDays, usedOrbit }) => {
                  log(`Selected: last ${usedDays} days (${usedOrbit})`);
                  log(`Images found (after window): ${afterCount}`);

                  afterImgDb.get("system:time_start").getInfo((t: number, e3: any) => {
                    if (!e3 && t) {
                      const utcIso = new Date(t).toISOString();
                      log(`Latest acquisition (UTC): ${utcIso}`);
                      log(`Latest acquisition (MYT): ${toMalaysiaTime(utcIso)}`);
                    }
                  });

                  const afterStart = endDate.advance(-usedDays, "day");
                  const beforeEnd = afterStart.advance(-BEFORE_GAP_DAYS, "day");
                  const beforeStart = beforeEnd.advance(-BEFORE_DAYS, "day");

                  log("Building baseline (median) ...");
                  const beforeCol = s1Collection(aoiGeom, beforeStart, beforeEnd, usedOrbit);

                  beforeCol.size().getInfo((beforeCount: number, e4: any) => {
                    if (e4) return error("Cannot load baseline Sentinel-1 images", e4);
                    if (!beforeCount || beforeCount < 1) {
                      return error("No baseline images found. Try BEFORE_DAYS=60.");
                    }

                    log(`Images found (baseline window): ${beforeCount}`);

                    header("🌊 Flood mask (SAR)");

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

                    header("📐 Flooded area (AOI)");

                    const floodAreaAOI = ee.Image.pixelArea()
                      .updateMask(floodMask)
                      .reduceRegion({
                        reducer: ee.Reducer.sum(),
                        geometry: aoiGeom,
                        scale: 10,
                        maxPixels: 1e13,
                      });

                    floodAreaAOI.getInfo((res: any, e5: any) => {
                      if (e5) return error("Failed to calculate flooded area (AOI)", e5);

                      const floodedM2 = Number(res?.sum ?? 0);
                      const floodedKm2 = floodedM2 / 1_000_000;

                      log(`Estimated flooded area: ${floodedKm2.toFixed(2)} km²`);
                      log(`Estimated flooded area: ${Math.round(floodedM2).toLocaleString()} m²`);

                      if (floodedKm2 < 0.05) {
                        warn("Flooded area is small. If this is demo mode, try a nearby date.");
                        warn("Try THRESHOLD=0.75 or DEMO_DATE_UTC=2021-12-19 / 2021-12-21.");
                      }

                      // -------- Grid flood labels --------
                      header("🏷️ Grid flood labels");

                      // flooded area per pixel (m2) masked by floodMask
                      const floodAreaImg = ee.Image.pixelArea()
                        .updateMask(floodMask)
                        .rename("flooded_m2");

                      // Sum flooded area inside each grid cell
                      const gridFlood = floodAreaImg.reduceRegions({
                        collection: grid,
                        reducer: ee.Reducer.sum(),
                        scale: 10,
                      });

                      // Add flooded_m2 + label (fix: no defaultValue; use Algorithms.If)
                      const labeled = gridFlood.map((f: any) => {
                        const raw = f.get("sum");
                        const m2 = ee.Number(ee.Algorithms.If(raw, raw, 0));
                        const label = m2.gte(FLOOD_LABEL_MIN_M2).int();
                        return ee.Feature(f).set({
                          flooded_m2: m2,
                          flood_label: label,
                        });
                      });

                      // Count flooded cells
                      labeled
                        .filter(ee.Filter.eq("flood_label", 1))
                        .size()
                        .getInfo((k: number, e6: any) => {
                          if (e6) return error("Failed to count flooded grid cells", e6);
                          log(`Flooded grid cells (label=1): ${k} / ${n}`);
                          log(`Label threshold: flooded_m2 >= ${FLOOD_LABEL_MIN_M2.toLocaleString()} m²`);
                        });

                      // Print sample rows
                      labeled
                        .limit(10)
                        .map((f: any) =>
                          ee.Feature(
                            null,
                            f.toDictionary([
                              "grid_id",
                              "centroid_lat",
                              "centroid_lon",
                              "flooded_m2",
                              "flood_label",
                            ])
                          )
                        )
                        .getInfo((fcJson: any, e7: any) => {
                          if (e7) return error("Failed to read sample labeled rows", e7);

                          log("Sample labeled rows (first 10):");
                          for (const feat of fcJson.features) {
                            const p = feat.properties;
                            const lat = Number(p.centroid_lat).toFixed(5);
                            const lon = Number(p.centroid_lon).toFixed(5);
                            const m2 = Number(p.flooded_m2 ?? 0);
                            const label = Number(p.flood_label ?? 0);
                            log(
                              `grid_id=${p.grid_id} lat=${lat} lon=${lon} flooded_m2=${Math.round(
                                m2
                              )} label=${label}`
                            );
                          }

                          log("Done");
                        });
                    });
                  });
                },
                () => {
                  error("No Sentinel-1 images found for any window/orbit.");
                  warn("Try adding 120 to AFTER_WINDOWS or choose another DEMO_DATE_UTC.");
                }
              );
            });
          });
        });
      },
      (e: any) => error("Earth Engine initialize error", e)
    );
  },
  (e: any) => error("Earth Engine auth error", e)
);