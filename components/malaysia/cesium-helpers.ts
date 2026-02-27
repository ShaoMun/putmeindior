import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  Cesium3DTileStyle,
  Color,
  Credit,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  HeightReference,
  LabelStyle,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  Rectangle,
  SingleTileImageryProvider,
  UrlTemplateImageryProvider,
  Viewer,
  CustomShader,
  CustomShaderMode,
  CustomShaderTranslucencyMode,
  LightingModel,
  type Entity,
} from "cesium";
import { threats, threatColor } from "@/lib/threats";
import {
  KL_LAT,
  KL_LON,
  MALAYSIA_BOUNDS,
  MALAYSIA_CENTER_LON,
  MALAYSIA_CENTER_LAT,
  MIN_CAMERA_HEIGHT_METERS,
  MAX_CAMERA_HEIGHT_METERS,
  FAR_RECENTER_HEIGHT_METERS,
  WEST_MALAYSIA_IMAGERY_RECTANGLE,
  SOUTH_CHINA_SEA_IMAGERY_RECTANGLE,
  LAND_IMAGERY_RECTANGLES,
  BLACK_PIXEL,
  OCEAN_TILE,
} from "./constants";

/* ─── marker color helper ─── */

function markerColor(probability: number) {
  const bucket = threatColor(probability);
  if (bucket === "green") return Color.fromCssColorString("#3ee96a");
  if (bucket === "orange") return Color.fromCssColorString("#ff9e45");
  return Color.fromCssColorString("#ff3b2f");
}

/* ─── Scene & lighting setup ─── */

export function enterDashboard(viewer: Viewer) {
  viewer.scene.globe.enableLighting = true;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.00015;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
  if (viewer.scene.sun) viewer.scene.sun.show = false;
  if (viewer.scene.moon) viewer.scene.moon.show = false;

  addThreatEntities(viewer);

  viewer.entities.add({
    id: "kl-pulse-center",
    position: Cartesian3.fromDegrees(KL_LON, KL_LAT, 0),
    point: {
      color: Color.fromCssColorString("#ff453a").withAlpha(0.9),
      pixelSize: new CallbackProperty(
        () => 10 + (Math.sin(performance.now() / 220) + 1) * 4,
        false,
      ),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/* ─── Threat entity markers ─── */

/** The flood-signal hotspot near Kampung Baru */
export const FLOOD_SIGNAL_THREAT_ID = "KL-018";

function addThreatEntities(viewer: Viewer) {
  for (const threat of threats) {
    // Override color for the Kampung Baru flood signal
    const isFloodSignal = threat.id === FLOOD_SIGNAL_THREAT_ID;
    const dotColor = isFloodSignal
      ? Color.fromCssColorString("#61b8ff")
      : markerColor(threat.probability);

    viewer.entities.add({
      id: `threat-${threat.id}`,
      position: Cartesian3.fromDegrees(threat.lon, threat.lat, 0),
      properties: { threatId: threat.id },
      point: {
        color: dotColor,
        pixelSize: isFloodSignal ? 14 : 11,
        outlineColor: isFloodSignal
          ? Color.fromCssColorString("#61b8ff").withAlpha(0.5)
          : Color.WHITE.withAlpha(0.9),
        outlineWidth: isFloodSignal ? 4 : 2.5,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
}

/* ─── Imagery + terrain + buildings ─── */

export async function setDashboardVisualMode(viewer: Viewer) {
  if (viewer.isDestroyed()) return undefined;

  const terrainProvider = await createWorldTerrainAsync();
  if (viewer.isDestroyed()) return undefined;
  viewer.terrainProvider = terrainProvider;
  viewer.scene.globe.baseColor = Color.fromCssColorString("#041324");

  viewer.imageryLayers.removeAll(true);

  // Global black base
  const blackBase = new SingleTileImageryProvider({
    url: BLACK_PIXEL,
    rectangle: Rectangle.MAX_VALUE,
    tileWidth: 1,
    tileHeight: 1,
  });
  viewer.imageryLayers.addImageryProvider(blackBase);

  // West Malaysia base — Using CARTO Dark Matter (dark_nolabels)
  const malaysiaBaseWest = new UrlTemplateImageryProvider({
    url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c", "d"],
    rectangle: WEST_MALAYSIA_IMAGERY_RECTANGLE,
    credit: new Credit("© OpenStreetMap © CARTO"),
  });
  const layer = viewer.imageryLayers.addImageryProvider(malaysiaBaseWest);
  layer.alpha = 1.0;
  layer.brightness = 2.5;
  layer.contrast = 1.3;
  layer.gamma = 1.2;
  layer.saturation = 0.0;

  // South China Sea ocean tile
  const seaLayer = viewer.imageryLayers.addImageryProvider(
    new SingleTileImageryProvider({
      url: OCEAN_TILE,
      rectangle: SOUTH_CHINA_SEA_IMAGERY_RECTANGLE,
      tileWidth: 4,
      tileHeight: 4,
    }),
  );
  seaLayer.alpha = 1.0;
  seaLayer.brightness = 0.6;
  seaLayer.contrast = 1.0;
  seaLayer.saturation = 0.0;

  // Dark labels on land
  for (const rectangle of LAND_IMAGERY_RECTANGLES) {
    const darkLabels = new UrlTemplateImageryProvider({
      url: "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
      subdomains: ["a", "b", "c", "d"],
      rectangle,
      credit: new Credit("© OpenStreetMap © CARTO"),
    });
    const labelsLayer = viewer.imageryLayers.addImageryProvider(darkLabels);
    labelsLayer.alpha = 0.92;
    labelsLayer.brightness = 1.52;
    labelsLayer.contrast = 2.05;
    labelsLayer.saturation = 0.0;
    labelsLayer.gamma = 1.2;
    darkLabels.errorEvent.addEventListener((error) => {
      console.warn("CARTO labels layer tile error", error);
    });
  }

  // 3D buildings
  try {
    const buildings = await createOsmBuildingsAsync();
    if (viewer.isDestroyed()) return undefined;
    buildings.show = true;

    buildings.style = new Cesium3DTileStyle({
      color: {
        conditions: [
          ["${feature['cesium#estimatedHeight']} >= 80", "color('#00ffcc', 0.65)"],
          ["${feature['cesium#estimatedHeight']} >= 30", "color('#00e6b8', 0.45)"],
          ["true", "color('#00cca3', 0.3)"],
        ],
      },
    });

    buildings.customShader = new CustomShader({
      mode: CustomShaderMode.MODIFY_MATERIAL,
      translucencyMode: CustomShaderTranslucencyMode.TRANSLUCENT,
      fragmentShaderText: `
        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          // Fade the bottoms so you can see the map text
          float z = fsInput.attributes.positionMC.z;
          float fade = smoothstep(0.0, 35.0, z);
          
          material.alpha *= fade;
          
          // Make the color modern and high-tech by adding an emissive glow 
          // so it doesn't get darkened by the lack of sunlight in the scene.
          material.emissive = material.diffuse * 0.2 * fade;
        }
      `,
    });

    buildings.maximumScreenSpaceError = 8;
    viewer.scene.primitives.add(buildings);
    return buildings;
  } catch (error) {
    console.warn("OSM buildings unavailable in dashboard mode", error);
    return undefined;
  }
}

/* ─── Camera bounds lock ─── */

export function lockCameraToMalaysia(viewer: Viewer) {
  const controller = viewer.scene.screenSpaceCameraController;
  controller.minimumZoomDistance = MIN_CAMERA_HEIGHT_METERS;
  controller.maximumZoomDistance = MAX_CAMERA_HEIGHT_METERS;

  let isClamping = false;
  const onCameraChanged = () => {
    if (isClamping || viewer.isDestroyed()) return;

    const cartographic = viewer.camera.positionCartographic;
    if (!cartographic) return;

    const lon = CesiumMath.toDegrees(cartographic.longitude);
    const lat = CesiumMath.toDegrees(cartographic.latitude);
    const height = cartographic.height;

    const clampedLon = CesiumMath.clamp(lon, MALAYSIA_BOUNDS.west, MALAYSIA_BOUNDS.east);
    const clampedLat = CesiumMath.clamp(lat, MALAYSIA_BOUNDS.south, MALAYSIA_BOUNDS.north);
    const clampedHeight = CesiumMath.clamp(height, MIN_CAMERA_HEIGHT_METERS, MAX_CAMERA_HEIGHT_METERS);

    const forceCenter = clampedHeight >= FAR_RECENTER_HEIGHT_METERS;
    const targetLon = forceCenter ? MALAYSIA_CENTER_LON : clampedLon;
    const targetLat = forceCenter ? MALAYSIA_CENTER_LAT : clampedLat;
    const targetHeight = forceCenter ? FAR_RECENTER_HEIGHT_METERS : clampedHeight;
    const targetHeading = forceCenter ? 0 : viewer.camera.heading;
    const targetPitch = forceCenter ? CesiumMath.toRadians(-89) : viewer.camera.pitch;

    const needsClamp =
      Math.abs(targetLon - lon) > 1e-7 ||
      Math.abs(targetLat - lat) > 1e-7 ||
      Math.abs(targetHeight - height) > 0.01 ||
      (forceCenter && Math.abs(viewer.camera.pitch - targetPitch) > 1e-4);
    if (!needsClamp) return;

    isClamping = true;
    try {
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(targetLon, targetLat, targetHeight),
        orientation: { heading: targetHeading, pitch: targetPitch, roll: 0 },
      });
    } finally {
      isClamping = false;
    }
  };

  viewer.camera.changed.addEventListener(onCameraChanged);
  return () => {
    if (viewer.isDestroyed()) return;
    viewer.camera.changed.removeEventListener(onCameraChanged);
  };
}


/* ─── Evacuation route animation ─── */

const EVAC_IDS = {
  BG_ROUTE: "evac-bg-route",
  ANIM_ROUTE: "evac-anim-route",
  HEAD_DOT: "evac-head-dot",
  DEST_MARKER: "evac-dest-marker",
};

/** Road-traced walking route from KL-018 to Dewan Komuniti (via OSRM) [lon, lat] */
const EVAC_WAYPOINTS: [number, number][] = [
  [101.704, 3.162956],
  [101.703794, 3.162956],
  [101.703796, 3.16317],
  [101.703803, 3.163736],
  [101.703803, 3.163769],
  [101.703676, 3.163768],
  [101.703413, 3.163768],
  [101.703276, 3.163768],
  [101.703057, 3.163767],
  [101.702959, 3.163767],
  [101.702959, 3.163815],
  [101.70296, 3.163907],
  [101.702961, 3.164224],
  [101.702962, 3.164506],
  [101.702962, 3.164641],
  [101.702962, 3.164681],
  [101.702963, 3.164914],
  [101.702964, 3.165241],
  [101.702964, 3.165467],
  [101.702963, 3.165487],
  [101.702961, 3.165502],
  [101.702961, 3.165537],
  [101.702962, 3.165688],
  [101.702962, 3.165729],
  [101.702963, 3.165846],
  [101.702964, 3.166002],
  [101.702964, 3.166026],
  [101.702967, 3.166474],
  [101.702968, 3.166555],
  [101.702968, 3.166776],
  [101.702972, 3.166896],
  [101.702969, 3.166982],
  [101.702969, 3.167105],
  [101.702969, 3.167149],
  [101.702969, 3.167193],
  [101.70297, 3.167397],
  [101.70297, 3.167479],
  [101.702969, 3.16765],
  [101.702972, 3.167857],
  [101.702973, 3.167937],
  [101.702849, 3.16791],
  [101.702131, 3.167907],
  [101.701195, 3.167906],
  [101.700801, 3.167903],
  [101.700675, 3.16789],
  [101.700629, 3.167884],
  [101.700562, 3.167861],
  [101.700378, 3.167805],
  [101.700162, 3.167728],
  [101.699553, 3.167497],
  [101.699164, 3.167349],
  [101.698907, 3.167289],
  [101.698794, 3.167279],
  [101.698618, 3.16728],
  [101.698455, 3.167322],
  [101.698418, 3.167334],
  [101.698394, 3.167351],
  [101.698372, 3.167379],
  [101.698362, 3.167407],
  [101.698363, 3.167433],
  [101.698364, 3.167489],
  [101.698377, 3.167948],
  [101.698372, 3.168203],
  [101.698369, 3.168323],
  [101.698365, 3.168509],
  [101.698364, 3.168631],
  [101.698361, 3.168818],
  [101.698309, 3.168816],
  [101.698202, 3.168811],
  [101.698113, 3.168807],
  [101.697849, 3.168823],
  [101.697749, 3.168859],
  [101.697184, 3.169319],
  [101.697022, 3.169447],
  [101.697056, 3.169482],
  [101.697254, 3.169678],
  [101.697262, 3.169688],  // End: Dewan Komuniti (Jalan Taiping)
];

const EVAC_FULL_POSITIONS = EVAC_WAYPOINTS.map(([lon, lat]) =>
  Cartesian3.fromDegrees(lon, lat, 8)
);

const TRACE_DURATION = 5000;  // ms to trace the route
const HOLD_DURATION = 1500;   // ms to hold at destination
const CYCLE = TRACE_DURATION + HOLD_DURATION;

function interpolateRoute(progress: number): Cartesian3[] {
  const n = EVAC_WAYPOINTS.length;
  if (progress >= 1) return [...EVAC_FULL_POSITIONS];
  if (progress <= 0) return [EVAC_FULL_POSITIONS[0]];

  const totalSegments = n - 1;
  const pos = progress * totalSegments;
  const segIdx = Math.floor(pos);
  const segFrac = pos - segIdx;

  const result = EVAC_FULL_POSITIONS.slice(0, segIdx + 1);

  if (segIdx < totalSegments) {
    const from = EVAC_WAYPOINTS[segIdx];
    const to = EVAC_WAYPOINTS[segIdx + 1];
    const lon = from[0] + (to[0] - from[0]) * segFrac;
    const lat = from[1] + (to[1] - from[1]) * segFrac;
    result.push(Cartesian3.fromDegrees(lon, lat, 8));
  }
  return result;
}

function headPosition(progress: number): { lon: number; lat: number } {
  const n = EVAC_WAYPOINTS.length;
  const p = Math.min(Math.max(progress, 0), 1);
  const totalSegments = n - 1;
  const pos = p * totalSegments;
  const segIdx = Math.min(Math.floor(pos), totalSegments - 1);
  const segFrac = pos - segIdx;

  const from = EVAC_WAYPOINTS[segIdx];
  const to = EVAC_WAYPOINTS[Math.min(segIdx + 1, n - 1)];
  return {
    lon: from[0] + (to[0] - from[0]) * segFrac,
    lat: from[1] + (to[1] - from[1]) * segFrac,
  };
}

/**
 * Adds an animated evacuation route from the flood hotspot to Dewan Komuniti.
 * Returns a cleanup function to remove all entities.
 */
export function addEvacuationRoute(viewer: Viewer): () => void {
  if (viewer.isDestroyed()) return () => {};

  const startTime = performance.now();

  function getProgress(): number {
    const elapsed = (performance.now() - startTime) % CYCLE;
    if (elapsed > TRACE_DURATION) return 1;
    // Ease-out cubic for smooth deceleration
    const t = elapsed / TRACE_DURATION;
    return 1 - Math.pow(1 - t, 3);
  }

  // 1. Background ghost route (full path, faint)
  viewer.entities.add({
    id: EVAC_IDS.BG_ROUTE,
    polyline: {
      positions: EVAC_FULL_POSITIONS,
      width: 6,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.3,
        color: Color.fromCssColorString("#3ee96a").withAlpha(0.15),
      }),
      clampToGround: true,
    },
  });

  // 2. Animated tracing route
  viewer.entities.add({
    id: EVAC_IDS.ANIM_ROUTE,
    polyline: {
      positions: new CallbackProperty(() => interpolateRoute(getProgress()), false),
      width: 5,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.35,
        color: Color.fromCssColorString("#3ee96a").withAlpha(0.85),
      }),
      clampToGround: true,
    },
  });

  // 3. Moving head dot
  viewer.entities.add({
    id: EVAC_IDS.HEAD_DOT,
    position: new CallbackProperty(() => {
      const { lon, lat } = headPosition(getProgress());
      return Cartesian3.fromDegrees(lon, lat, 8);
    }, false) as unknown as Cartesian3,
    point: {
      color: Color.fromCssColorString("#3ee96a"),
      pixelSize: new CallbackProperty(
        () => 9 + Math.sin(performance.now() / 180) * 3,
        false,
      ),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  // 4. Destination marker at Dewan Komuniti
  const dest = EVAC_WAYPOINTS[EVAC_WAYPOINTS.length - 1];
  viewer.entities.add({
    id: EVAC_IDS.DEST_MARKER,
    position: Cartesian3.fromDegrees(dest[0], dest[1], 0),
    point: {
      color: Color.fromCssColorString("#3ee96a").withAlpha(0.9),
      pixelSize: new CallbackProperty(
        () => 10 + (Math.sin(performance.now() / 300) + 1) * 3,
        false,
      ),
      outlineColor: Color.fromCssColorString("#3ee96a").withAlpha(0.35),
      outlineWidth: 6,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: "DEWAN KOMUNITI",
      font: "bold 11px Rajdhani, monospace",
      fillColor: Color.fromCssColorString("#3ee96a"),
      outlineColor: Color.BLACK,
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -22),
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  // Cleanup
  return () => {
    if (viewer.isDestroyed()) return;
    Object.values(EVAC_IDS).forEach((id) => viewer.entities.removeById(id));
  };
}
