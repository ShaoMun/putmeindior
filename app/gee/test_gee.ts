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
// Main
// ----------------------------
header("GEE Grid Test (Kuala Lumpur)");

ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    ee.initialize(
      null,
      null,
      () => {
        log("Earth Engine initialized");

        // ----------------------------
        // AOI
        // ----------------------------
        const districts = ee.FeatureCollection("FAO/GAUL/2015/level2");

        const aoi = districts
          .filter(ee.Filter.eq("ADM0_NAME", COUNTRY))
          .filter(ee.Filter.eq("ADM1_NAME", STATE))
          .filter(ee.Filter.eq("ADM2_NAME", DISTRICT));

        aoi.size().getInfo((count: number, e0: any) => {
          if (e0) return error("Failed to read AOI", e0);
          if (!count || count < 1) return error("AOI not found");

          log(`AOI: ${DISTRICT}, ${STATE}, ${COUNTRY}`);

          const aoiGeom = aoi.geometry();

          aoiGeom.area().divide(1e6).getInfo((areaKm2: number, e1: any) => {
            if (e1) return error("Failed to compute AOI area", e1);
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
              });
            });

            gridWithCentroid.size().getInfo((n: number, e2: any) => {
              if (e2) return error("Grid creation failed", e2);

              log(`Grid cells: ${n}`);

              // ----------------------------
              // Sample output
              // ----------------------------
              header("Sample grid cells (first 5)");

              gridWithCentroid
                .limit(5)
                .map((f: any) =>
                  ee.Feature(
                    null,
                    f.toDictionary([
                      "grid_id",
                      "centroid_lat",
                      "centroid_lon",
                    ])
                  )
                )
                .getInfo((fc: any, e3: any) => {
                  if (e3) return error("Failed to read grid sample", e3);

                  for (const feat of fc.features) {
                    const p = feat.properties;
                    log(
                      `grid_id=${p.grid_id} lat=${Number(p.centroid_lat).toFixed(
                        5
                      )} lon=${Number(p.centroid_lon).toFixed(5)}`
                    );
                  }

                  log("Done");
                });
            });
          });
        });
      },
      (e: any) => error("Earth Engine initialize error", e)
    );
  },
  (e: any) => error("Earth Engine auth error", e)
);