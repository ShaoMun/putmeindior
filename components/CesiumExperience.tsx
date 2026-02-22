"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cartesian2,
  CallbackProperty,
  Cartesian3,
  Cesium3DTileStyle,
  Color,
  createOsmBuildingsAsync,
  createWorldImageryAsync,
  createWorldTerrainAsync,
  HeightReference,
  Ion,
  IonWorldImageryStyle,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  type Entity,
} from "cesium";
import { threats, threatColor } from "@/lib/threats";

type Phase = "GLOBE_INTRO" | "FLY_TO_KL" | "DASHBOARD";

const KL_LAT = 3.139;
const KL_LON = 101.6869;

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
      viewer.scene.globe.baseColor = Color.fromCssColorString("#27323d");

      const imageryProvider = await createWorldImageryAsync({
        style: IonWorldImageryStyle.AERIAL_WITH_LABELS,
      });
      if (shouldStop()) return;
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(imageryProvider);

      try {
        const buildings = await createOsmBuildingsAsync();
        if (shouldStop()) return;
        buildings.style = new Cesium3DTileStyle({
          color: "color('#d7dde5', 0.45)",
        });
        viewer.scene.primitives.add(buildings);
      } catch (error) {
        console.warn("OSM buildings unavailable", error);
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
        destination: Cartesian3.fromDegrees(104.5, 7.5, 22_000_000),
        orientation: {
          heading: CesiumMath.toRadians(5),
          pitch: CesiumMath.toRadians(-34),
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
            activeViewer.camera.rotate(Cartesian3.UNIT_Z, 0.00125);
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
            enterDashboard(completedViewer);
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
        if (!picked) return;
        const entity = (picked as { id?: Entity }).id;
        if (entity) {
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
      clickHandler?.destroy();
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.cancelFlight();
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
  const baseLayer = viewer.imageryLayers.get(0);
  if (baseLayer) {
    baseLayer.brightness = 0.95;
    baseLayer.contrast = 1.1;
    baseLayer.saturation = 1.05;
  }

  viewer.scene.globe.enableLighting = false;

  addTerrainGrid(viewer);
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
        outlineColor: Color.BLACK.withAlpha(0.9),
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
}

function addTerrainGrid(viewer: Viewer) {
  const west = 101.55;
  const east = 101.8;
  const south = 3.0;
  const north = 3.25;
  const spacing = 0.015;

  for (let lat = south; lat <= north; lat += spacing) {
    viewer.entities.add({
      polyline: {
        positions: [
          Cartesian3.fromDegrees(west, lat, 0),
          Cartesian3.fromDegrees(east, lat, 0),
        ],
        clampToGround: true,
        width: 0.7,
        material: new PolylineGlowMaterialProperty({
          color: Color.fromCssColorString("#66f58f").withAlpha(0.14),
          glowPower: 0.03,
        }),
      },
    });
  }

  for (let lon = west; lon <= east; lon += spacing) {
    viewer.entities.add({
      polyline: {
        positions: [
          Cartesian3.fromDegrees(lon, south, 0),
          Cartesian3.fromDegrees(lon, north, 0),
        ],
        clampToGround: true,
        width: 0.7,
        material: new PolylineGlowMaterialProperty({
          color: Color.fromCssColorString("#66f58f").withAlpha(0.14),
          glowPower: 0.03,
        }),
      },
    });
  }
}
