"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cartesian2,
  CallbackProperty,
  Cartesian3,
  Cesium3DTileset,
  Cesium3DTileStyle,
  Color,
  Credit,
  createOsmBuildingsAsync,
  buildModuleUrl,
  defined,
  createWorldTerrainAsync,
  HeightReference,
  Ion,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  Viewer,
  type Entity,
} from "cesium";
import { threats, threatColor } from "@/lib/threats";

type Phase = "GLOBE_INTRO" | "FLY_TO_KL" | "DASHBOARD";

const KL_LAT = 3.139;
const KL_LON = 101.6869;
const MALAYSIA_BOUNDS = {
  west: 99.5,
  east: 119.6,
  south: 0.8,
  north: 7.5,
};
const MIN_CAMERA_HEIGHT_METERS = 120;
const MAX_CAMERA_HEIGHT_METERS = 2_200_000;
const BLACK_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5l9VUAAAAASUVORK5CYII=";

function markerColor(probability: number) {
  const bucket = threatColor(probability);
  if (bucket === "green") return Color.fromCssColorString("#3ee96a");
  if (bucket === "orange") return Color.fromCssColorString("#ff9e45");
  return Color.fromCssColorString("#ff3b2f");
}

export default function CesiumExperience() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("GLOBE_INTRO");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: Viewer | undefined;
    let clickHandler: ScreenSpaceEventHandler | undefined;
    let removeIntroTick: (() => void) | undefined;
    let removeTileLoadListener: (() => void) | undefined;
    let removeCameraBoundsListener: (() => void) | undefined;
    let removeTerrainMesh: (() => void) | undefined;
    let buildingsTileset: Cesium3DTileset | undefined;
    let isMounted = true;
    let isCleaningUp = false;

    const shouldStop = () =>
      !viewer || isCleaningUp || !isMounted || viewer.isDestroyed();

    async function initialize() {
      window.CESIUM_BASE_URL = "/cesium/";
      Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

      viewer = new Viewer(container as HTMLDivElement, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        shouldAnimate: true,
      });
      if (shouldStop()) return;

      const terrainProvider = await createWorldTerrainAsync();
      if (shouldStop()) return;
      viewer.terrainProvider = terrainProvider;
      viewer.scene.globe.baseColor = Color.fromCssColorString("#4a6073");
      viewer.scene.globe.enableLighting = false;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
      }

      // Ensure Earth is visible on first load even if external imagery is unavailable.
      try {
        const introImagery = await TileMapServiceImageryProvider.fromUrl(
          buildModuleUrl("Assets/Textures/NaturalEarthII"),
        );
        if (!shouldStop()) {
          viewer.imageryLayers.removeAll(true);
          viewer.imageryLayers.addImageryProvider(introImagery);
        }
      } catch (error) {
        console.warn("Intro imagery unavailable, using globe base color only", error);
      }

      const stopLoadingWhenReady = (queueLength: number) => {
        if (
          queueLength === 0 &&
          viewer &&
          !viewer.isDestroyed() &&
          !isCleaningUp &&
          viewer.scene.globe.tilesLoaded &&
          isMounted
        ) {
          setLoading(false);
        }
      };

      viewer.scene.globe.tileLoadProgressEvent.addEventListener(stopLoadingWhenReady);
      removeTileLoadListener = () => {
        if (!viewer || viewer.isDestroyed()) return;
        viewer.scene.globe.tileLoadProgressEvent.removeEventListener(stopLoadingWhenReady);
      };

      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(103.5, 6.5, 24_000_000),
        orientation: {
          heading: CesiumMath.toRadians(8),
          pitch: CesiumMath.toRadians(-38),
          roll: 0,
        },
      });

      const startTs = performance.now();
      const onIntroTick = () => {
        if (shouldStop()) return;
        const activeViewer = viewer;
        if (!activeViewer) return;
        const elapsed = performance.now() - startTs;
        if (elapsed <= 2500) {
          try {
            const t = elapsed / 2500;
            activeViewer.camera.setView({
              destination: Cartesian3.fromDegrees(103.5, 6.5, 24_000_000),
              orientation: {
                heading: CesiumMath.toRadians(8 + t * 22),
                pitch: CesiumMath.toRadians(-38),
                roll: 0,
              },
            });
          } catch {
            return;
          }
          return;
        }

        if (removeIntroTick) {
          removeIntroTick();
          removeIntroTick = undefined;
        }

        setPhase("FLY_TO_KL");

        activeViewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(KL_LON, KL_LAT, 12_000),
          duration: 3.5,
          orientation: {
            heading: CesiumMath.toRadians(20),
            pitch: CesiumMath.toRadians(-35),
            roll: 0,
          },
          complete: () => {
            if (shouldStop()) return;
            const completedViewer = viewer;
            if (!completedViewer) return;
            setDashboardVisualMode(completedViewer).then((tileset) => {
              buildingsTileset = tileset;
            });
            removeCameraBoundsListener = lockCameraToMalaysia(completedViewer);
            enterDashboard(completedViewer);
            removeTerrainMesh = addTerrainSurfaceMesh(completedViewer);
            setPhase("DASHBOARD");
          },
        });
      };

      viewer.clock.onTick.addEventListener(onIntroTick);
      removeIntroTick = () => {
        if (!viewer || viewer.isDestroyed()) return;
        viewer.clock.onTick.removeEventListener(onIntroTick);
      };

      clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((movement: { position: unknown }) => {
        if (shouldStop()) return;
        const activeViewer = viewer;
        if (!activeViewer) return;
        let picked;
        try {
          picked = activeViewer.scene.pick(movement.position as Cartesian2);
        } catch {
          return;
        }
        if (!defined(picked)) return;
        const entity = (picked as { id?: Entity }).id;
        if (entity && !entity.id?.startsWith("threat-")) {
          activeViewer.selectedEntity = entity;
        }
      }, ScreenSpaceEventType.LEFT_CLICK);
    }

    initialize().catch((error) => {
      console.error("Failed to initialize Cesium experience", error);
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      isCleaningUp = true;
      removeIntroTick?.();
      removeTileLoadListener?.();
      removeCameraBoundsListener?.();
      removeTerrainMesh?.();
      clickHandler?.destroy();
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.cancelFlight();
        if (buildingsTileset) {
          viewer.scene.primitives.remove(buildingsTileset);
          buildingsTileset = undefined;
        }
        viewer.destroy();
      }
      viewer = undefined;
    };
  }, []);

  return (
    <main className="threat-experience">
      <div ref={containerRef} className="cesium-container" />

      {loading ? <div className="loading-overlay">Loading terrain...</div> : null}

      <div className={`hud-overlay ${phase === "DASHBOARD" ? "active" : ""}`} />
    </main>
  );
}

function enterDashboard(viewer: Viewer) {
  viewer.scene.globe.enableLighting = true;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.00015;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = false;
  }
  if (viewer.scene.sun) {
    viewer.scene.sun.show = false;
  }
  if (viewer.scene.moon) {
    viewer.scene.moon.show = false;
  }

  addThreatEntities(viewer);

  viewer.entities.add({
    id: "kl-pulse-center",
    position: Cartesian3.fromDegrees(KL_LON, KL_LAT, 0),
    point: {
      color: Color.fromCssColorString("#ff453a").withAlpha(0.9),
      pixelSize: new CallbackProperty(() => 10 + (Math.sin(performance.now() / 220) + 1) * 4, false),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function addTerrainSurfaceMesh(viewer: Viewer) {
  const west = 101.55;
  const east = 101.8;
  const south = 3.0;
  const north = 3.25;
  const denseStep = 0.0003;
  const densePointStep = 0.0003;
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
      const lat = baseLat + wave;
      positions.push(Cartesian3.fromRadians(CesiumMath.toRadians(lon), CesiumMath.toRadians(lat), 0));
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
      const lon = baseLon + wave;
      positions.push(Cartesian3.fromRadians(CesiumMath.toRadians(lon), CesiumMath.toRadians(lat), 0));
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
      const entity = viewer.entities.add({
        polyline: {
          positions: buildLatLine(bounds, lat, pointStep, waveAmp),
          clampToGround: true,
          width,
          material: new PolylineGlowMaterialProperty({
            color: bandColors[band].withAlpha(alpha),
            glowPower: glow,
          }),
        },
      });
      entities.push(entity);
    }

    for (let lon = bounds.west; lon <= bounds.east; lon += step) {
      const band =
        Math.floor(
          ((lon - bounds.west) / Math.max(0.0001, bounds.east - bounds.west)) * bandColors.length,
        ) % bandColors.length;
      const entity = viewer.entities.add({
        polyline: {
          positions: buildLonLine(bounds, lon, pointStep, waveAmp),
          clampToGround: true,
          width,
          material: new PolylineGlowMaterialProperty({
            color: bandColors[band].withAlpha(alpha),
            glowPower: glow,
          }),
        },
      });
      entities.push(entity);
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
    if (!rect) {
      return {
        lon: KL_LON,
        lat: KL_LAT,
        lonSpan: 999,
        latSpan: 999,
      };
    }
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
    const halfLon = 0.02;
    const halfLat = 0.02;
    return {
      west: CesiumMath.clamp(lon - halfLon, west, east),
      east: CesiumMath.clamp(lon + halfLon, west, east),
      south: CesiumMath.clamp(lat - halfLat, south, north),
      north: CesiumMath.clamp(lat + halfLat, south, north),
    };
  };

  const hideChunk = (key: string | null) => {
    if (!key) return;
    const entities = meshCache.get(key);
    if (!entities) return;
    for (const entity of entities) entity.show = false;
  };

  const showChunk = (key: string) => {
    const entities = meshCache.get(key);
    if (!entities) return;
    for (const entity of entities) entity.show = true;
  };

  const evictOldestChunk = () => {
    while (cacheOrder.length > maxCacheChunks) {
      const oldest = cacheOrder.shift();
      if (!oldest) return;
      if (oldest === activeKey) {
        cacheOrder.push(oldest);
        return;
      }
      const entities = meshCache.get(oldest);
      if (!entities) continue;
      for (const entity of entities) viewer.entities.remove(entity);
      meshCache.delete(oldest);
    }
  };

  const ensureDenseChunk = (lon: number, lat: number) => {
    const key = chunkKeyFromCenter(lon, lat);
    if (meshCache.has(key)) return key;

    const bounds = chunkBoundsFromCenter(lon, lat);
    if (bounds.east - bounds.west <= 0.0001 || bounds.north - bounds.south <= 0.0001) return null;

    const entities = addLayer(bounds, denseStep, densePointStep, denseWaveAmp, 1.45, 0.32, 0.1);
    for (const entity of entities) entity.show = false;
    meshCache.set(key, entities);
    cacheOrder.push(key);
    evictOldestChunk();
    return key;
  };

  const pickLod = (): MeshLod => {
    const height = viewer.camera.positionCartographic.height;
    const view = getViewCenter();

    // Dense mesh only when truly close:
    // 1) camera low enough, and
    // 2) visible ground footprint is narrow.
    const isCloseHeight = height <= 8_000;
    const isCloseFootprint = view.lonSpan <= 0.09 && view.latSpan <= 0.09;

    if (isCloseHeight && isCloseFootprint) return "dense";
    return "none";
  };

  let currentLod: MeshLod | null = null;
  let regenTimer: ReturnType<typeof setTimeout> | null = null;

  const buildLod = (lod: MeshLod) => {
    if (lod === "dense") {
      const view = getViewCenter();
      const key = ensureDenseChunk(view.lon, view.lat);
      if (!key) {
        hideChunk(activeKey);
        activeKey = null;
        return;
      }
      if (activeKey !== key) {
        hideChunk(activeKey);
        showChunk(key);
        activeKey = key;
      }
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
        for (const entity of entities) {
          viewer.entities.remove(entity);
        }
      }
      meshCache.clear();
      cacheOrder.length = 0;
      activeKey = null;
    }
  };
}

async function setDashboardVisualMode(viewer: Viewer) {
  if (viewer.isDestroyed()) return undefined;
  viewer.imageryLayers.removeAll(true);

  const blackBase = new SingleTileImageryProvider({
    url: BLACK_PIXEL,
    rectangle: Rectangle.MAX_VALUE,
    tileWidth: 1,
    tileHeight: 1,
  });
  viewer.imageryLayers.addImageryProvider(blackBase);

  const darkRoads = new UrlTemplateImageryProvider({
    url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c", "d"],
    credit: new Credit("© OpenStreetMap © CARTO"),
  });
  const roadsLayer = viewer.imageryLayers.addImageryProvider(darkRoads);
  roadsLayer.alpha = 0.9;
  roadsLayer.brightness = 1.12;
  roadsLayer.contrast = 2.05;
  roadsLayer.saturation = 0.0;
  roadsLayer.gamma = 1.12;
  darkRoads.errorEvent.addEventListener((error) => {
    console.warn("CARTO roads layer tile error", error);
  });

  const darkLabels = new UrlTemplateImageryProvider({
    url: "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c", "d"],
    credit: new Credit("© OpenStreetMap © CARTO"),
  });
  const labelsLayer = viewer.imageryLayers.addImageryProvider(darkLabels);
  labelsLayer.alpha = 0.98;
  labelsLayer.brightness = 1.35;
  labelsLayer.contrast = 1.75;
  labelsLayer.saturation = 0.0;
  labelsLayer.gamma = 1.14;
  darkLabels.errorEvent.addEventListener((error) => {
    console.warn("CARTO labels layer tile error", error);
  });

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

function addThreatEntities(viewer: Viewer) {
  for (const threat of threats) {
    viewer.entities.add({
      id: `threat-${threat.id}`,
      position: Cartesian3.fromDegrees(threat.lon, threat.lat, 0),
      properties: {
        threatId: threat.id,
      },
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

function lockCameraToMalaysia(viewer: Viewer) {
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
    const clampedHeight = CesiumMath.clamp(
      height,
      MIN_CAMERA_HEIGHT_METERS,
      MAX_CAMERA_HEIGHT_METERS,
    );

    const needsClamp =
      Math.abs(clampedLon - lon) > 1e-7 ||
      Math.abs(clampedLat - lat) > 1e-7 ||
      Math.abs(clampedHeight - height) > 0.01;

    if (!needsClamp) return;

    isClamping = true;
    try {
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(clampedLon, clampedLat, clampedHeight),
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
