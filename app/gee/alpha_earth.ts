/**
 * HARD-CODED Earth Engine (Node + ESM) script
 * - Auth with a service account JSON key
 * - Builds a hardcoded Sentinel-2 RGB layer over Kuala Lumpur-ish ROI
 * - Prints mapid/token/urlFormat + a ready-to-copy Leaflet tile snippet
 *
 * Run: node yourfile.ts (or compile to JS)
 */

import ee from "@google/earthengine";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ----------------------------
// Hardcoded config
// ----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ CHANGE THIS: service account key JSON
const keyPath = path.join(__dirname, "../../flood-488301-a46f29b2ccad.json");
const privateKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));

// ✅ CHANGE THIS: your GCP project id (used only to print a v1 tile URL template too)
const PROJECT_ID = "flood-488301";

// Hardcoded AOI (Kuala Lumpur-ish bbox)
const ROI = ee.Geometry.Rectangle([101.5, 2.5, 103.0, 3.7]);

// Hardcoded data (Sentinel-2 SR Harmonized) + vis
const START = "2024-01-01";
const END = "2024-12-31";
const VIS = { bands: ["B4", "B3", "B2"], min: 0, max: 3000, gamma: 1.2 };

// ----------------------------
// Helper: get map tiles info (embed URL)
// ----------------------------
function getMapAsync(image: any, vis: any): Promise<{ mapid: string; token?: string; urlFormat?: string }> {
  return new Promise((resolve, reject) => {
    try {
      const viz = ee.Image(image).visualize(vis);
      viz.getMap({}, (map: any, err: any) => {
        if (err) return reject(err);
        resolve({ mapid: map.mapid, token: map.token, urlFormat: map.urlFormat });
      });
    } catch (e) {
      reject(e);
    }
  });
}

function tileTemplates(projectId: string, mapid: string, token?: string) {
  const v1 = `https://earthengine.googleapis.com/v1/projects/${projectId}/maps/${mapid}/tiles/{z}/{x}/{y}`;
  const v1alpha = `https://earthengine.googleapis.com/v1alpha/projects/${projectId}/maps/${mapid}/tiles/{z}/{x}/{y}`;
  return {
    v1: token ? `${v1}?token=${token}` : v1,
    v1alpha: token ? `${v1alpha}?token=${token}` : v1alpha,
  };
}

// ----------------------------
// Main
// ----------------------------
ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    ee.initialize(
      null,
      null,
      async () => {
        try {
          // Hardcoded image: S2 median RGB over ROI
          const s2 = ee
            .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(ROI)
            .filterDate(START, END)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
            .median()
            .clip(ROI);

          const map = await getMapAsync(s2, VIS);

          console.log("\n================= EMBED (TILES) INFO =================");
          console.log("mapid    :", map.mapid);
          console.log("token    :", map.token ?? "(none)");
          console.log("urlFormat:", map.urlFormat ?? "(none)");

          // Also print Cloud API templates (v1 + v1alpha) using your project id
          const urls = tileTemplates(PROJECT_ID, map.mapid, map.token);

          console.log("\n================= CLOUD API TILE URLS =================");
          console.log("v1     :", urls.v1);
          console.log("v1alpha:", urls.v1alpha);

          console.log("\n================= LEAFLET SNIPPET =================");
          console.log(`
// Paste into your web map:
const geeTiles = "${urls.v1}";
// If tiles 401, try v1alpha or ensure token is included.

L.tileLayer(geeTiles, { maxZoom: 20 }).addTo(map);
          `.trim());

          process.exit(0);
        } catch (e) {
          console.error("❌ Failed:", e);
          process.exit(1);
        }
      },
      (e: any) => {
        console.error("❌ EE initialize error:", e);
        process.exit(1);
      }
    );
  },
  (e: any) => {
    console.error("❌ EE auth error:", e);
    process.exit(1);
  }
);