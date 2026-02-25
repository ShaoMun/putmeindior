import {
  CallbackProperty,
  Cartesian3,
  Cesium3DTileset,
  Cesium3DTileStyle,
  Color,
  Credit,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  HeightReference,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  Rectangle,
  SingleTileImageryProvider,
  UrlTemplateImageryProvider,
  Viewer,
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

function addThreatEntities(viewer: Viewer) {
  for (const threat of threats) {
    viewer.entities.add({
      id: `threat-${threat.id}`,
      position: Cartesian3.fromDegrees(threat.lon, threat.lat, 0),
      properties: { threatId: threat.id },
      point: {
        color: markerColor(threat.probability),
        pixelSize: 11,
        outlineColor: Color.WHITE.withAlpha(0.9),
        outlineWidth: 2.5,
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
  // Boost base brightness/gamma so the dark-grey CARTO roads pop out visibly against the black background
  layer.brightness = 1.5;
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
          ["${feature['cesium#estimatedHeight']} >= 80", "color('rgba(95,255,255,0.52)')"],
          ["${feature['cesium#estimatedHeight']} >= 30", "color('rgba(70,245,255,0.4)')"],
          ["true", "color('rgba(55,230,245,0.28)')"],
        ],
      },
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

/* ─── Terrain surface mesh (LOD grid overlay) ─── */

export function addTerrainSurfaceMesh(viewer: Viewer) {
  const west = 101.55;
  const east = 101.8;
  const south = 3.0;
  const north = 3.25;
  const denseStep = 0.0005;
  const densePointStep = 0.0005;
  const denseWaveAmp = 0.00014;

  const bandColors = [
    Color.fromCssColorString("#b8f6ff"),
    Color.fromCssColorString("#ffd1a3"),
    Color.fromCssColorString("#c4ff72"),
  ];

  const buildLatLine = (
    bounds: { west: number; east: number; south: number; north: number },
    baseLat: number,
    pointStep: number,
    waveAmp: number,
  ) => {
    const positions: Cartesian3[] = [];
    for (let lon = bounds.west; lon <= bounds.east; lon += pointStep) {
      const wave =
        Math.sin((lon - bounds.west) * 120 + baseLat * 67) * waveAmp +
        Math.sin((lon - bounds.west) * 55 + baseLat * 29) * waveAmp * 0.6;
      positions.push(
        Cartesian3.fromRadians(CesiumMath.toRadians(lon), CesiumMath.toRadians(baseLat + wave), 0),
      );
    }
    return positions;
  };

  const buildLonLine = (
    bounds: { west: number; east: number; south: number; north: number },
    baseLon: number,
    pointStep: number,
    waveAmp: number,
  ) => {
    const positions: Cartesian3[] = [];
    for (let lat = bounds.south; lat <= bounds.north; lat += pointStep) {
      const wave =
        Math.cos((lat - bounds.south) * 118 + baseLon * 63) * waveAmp +
        Math.sin((lat - bounds.south) * 51 + baseLon * 37) * waveAmp * 0.55;
      positions.push(
        Cartesian3.fromRadians(CesiumMath.toRadians(baseLon + wave), CesiumMath.toRadians(lat), 0),
      );
    }
    return positions;
  };

  const addLayer = (
    bounds: { west: number; east: number; south: number; north: number },
    step: number,
    pointStep: number,
    waveAmp: number,
    width: number,
    alpha: number,
    glow: number,
  ) => {
    const entities: Entity[] = [];
    for (let lat = bounds.south; lat <= bounds.north; lat += step) {
      const band =
        Math.floor(
          ((lat - bounds.south) / Math.max(0.0001, bounds.north - bounds.south)) * bandColors.length,
        ) % bandColors.length;
      entities.push(
        viewer.entities.add({
          polyline: {
            positions: buildLatLine(bounds, lat, pointStep, waveAmp),
            clampToGround: true,
            width,
            material: new PolylineGlowMaterialProperty({
              color: bandColors[band].withAlpha(alpha),
              glowPower: glow,
            }),
          },
        }),
      );
    }
    for (let lon = bounds.west; lon <= bounds.east; lon += step) {
      const band =
        Math.floor(
          ((lon - bounds.west) / Math.max(0.0001, bounds.east - bounds.west)) * bandColors.length,
        ) % bandColors.length;
      entities.push(
        viewer.entities.add({
          polyline: {
            positions: buildLonLine(bounds, lon, pointStep, waveAmp),
            clampToGround: true,
            width,
            material: new PolylineGlowMaterialProperty({
              color: bandColors[band].withAlpha(alpha),
              glowPower: glow,
            }),
          },
        }),
      );
    }
    return entities;
  };

  type MeshLod = "none" | "dense";

  const meshCache = new Map<string, Entity[]>();
  const cacheOrder: string[] = [];
  const maxCacheChunks = 6;
  let activeKey: string | null = null;

  const getViewCenter = () => {
    const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rect) return { lon: KL_LON, lat: KL_LAT, lonSpan: 999, latSpan: 999 };
    return {
      lon: CesiumMath.toDegrees((rect.west + rect.east) * 0.5),
      lat: CesiumMath.toDegrees((rect.south + rect.north) * 0.5),
      lonSpan: Math.abs(CesiumMath.toDegrees(rect.east - rect.west)),
      latSpan: Math.abs(CesiumMath.toDegrees(rect.north - rect.south)),
    };
  };

  const quantize = (value: number, step: number) => Math.round(value / step) * step;
  const chunkKeyFromCenter = (lon: number, lat: number) =>
    `${quantize(lon, 0.01).toFixed(2)}:${quantize(lat, 0.01).toFixed(2)}`;

  const chunkBoundsFromCenter = (lon: number, lat: number) => {
    const half = 0.02;
    return {
      west: CesiumMath.clamp(lon - half, west, east),
      east: CesiumMath.clamp(lon + half, west, east),
      south: CesiumMath.clamp(lat - half, south, north),
      north: CesiumMath.clamp(lat + half, south, north),
    };
  };

  const hideChunk = (key: string | null) => {
    if (!key) return;
    const entities = meshCache.get(key);
    if (entities) for (const e of entities) e.show = false;
  };

  const showChunk = (key: string) => {
    const entities = meshCache.get(key);
    if (entities) for (const e of entities) e.show = true;
  };

  const evictOldestChunk = () => {
    while (cacheOrder.length > maxCacheChunks) {
      const oldest = cacheOrder.shift();
      if (!oldest) return;
      if (oldest === activeKey) { cacheOrder.push(oldest); return; }
      const entities = meshCache.get(oldest);
      if (!entities) continue;
      for (const e of entities) viewer.entities.remove(e);
      meshCache.delete(oldest);
    }
  };

  const ensureDenseChunk = (lon: number, lat: number) => {
    const key = chunkKeyFromCenter(lon, lat);
    if (meshCache.has(key)) return key;
    const bounds = chunkBoundsFromCenter(lon, lat);
    if (bounds.east - bounds.west <= 0.0001 || bounds.north - bounds.south <= 0.0001) return null;
    const entities = addLayer(bounds, denseStep, densePointStep, denseWaveAmp, 1.45, 0.32, 0.1);
    for (const e of entities) e.show = false;
    meshCache.set(key, entities);
    cacheOrder.push(key);
    evictOldestChunk();
    return key;
  };

  const pickLod = (): MeshLod => {
    const height = viewer.camera.positionCartographic.height;
    const view = getViewCenter();
    if (height <= 8_000 && view.lonSpan <= 0.09 && view.latSpan <= 0.09) return "dense";
    return "none";
  };

  let currentLod: MeshLod | null = null;
  let regenTimer: ReturnType<typeof setTimeout> | null = null;

  const buildLod = (lod: MeshLod) => {
    if (lod === "dense") {
      const view = getViewCenter();
      const key = ensureDenseChunk(view.lon, view.lat);
      if (!key) { hideChunk(activeKey); activeKey = null; return; }
      if (activeKey !== key) { hideChunk(activeKey); showChunk(key); activeKey = key; }
    } else {
      hideChunk(activeKey);
      activeKey = null;
    }
  };

  const updateLod = () => {
    if (viewer.isDestroyed()) return;
    const nextLod = pickLod();
    if (nextLod === currentLod) return;
    currentLod = nextLod;
    buildLod(nextLod);
  };

  const scheduleLodUpdate = () => {
    if (regenTimer) clearTimeout(regenTimer);
    regenTimer = setTimeout(updateLod, 140);
  };

  viewer.camera.changed.addEventListener(scheduleLodUpdate);
  updateLod();

  return () => {
    if (!viewer.isDestroyed()) {
      viewer.camera.changed.removeEventListener(scheduleLodUpdate);
      if (regenTimer) clearTimeout(regenTimer);
      for (const entities of meshCache.values()) {
        for (const e of entities) viewer.entities.remove(e);
      }
      meshCache.clear();
      cacheOrder.length = 0;
      activeKey = null;
    }
  };
}
