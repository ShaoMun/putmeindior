"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  defined,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  type Entity,
} from "cesium";
import { KL_LON, KL_LAT, DEFAULT_CAMERA_HEIGHT_METERS } from "./constants";
import {
  enterDashboard,
  setDashboardVisualMode,
  lockCameraToMalaysia,
  FLOOD_SIGNAL_THREAT_ID,
  addEvacuationRoute,
} from "./cesium-helpers";
import MalaysiaUI from "./MalaysiaUI";

type Phase = "LOADING" | "DASHBOARD";

export default function MalaysiaMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("LOADING");
  const [loading, setLoading] = useState(true);
  const [selectedThreatId, setSelectedThreatId] = useState<string | null>(null);

  const flyToLocation = useCallback((lat: number, lon: number) => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    v.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, DEFAULT_CAMERA_HEIGHT_METERS),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-70),
        roll: 0,
      },
      duration: 1.8,
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: Viewer | undefined;
    let clickHandler: ScreenSpaceEventHandler | undefined;
    let removeTileLoadListener: (() => void) | undefined;
    let removeCameraBoundsListener: (() => void) | undefined;
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
      viewerRef.current = viewer;
      if (shouldStop()) return;

      // Start directly over Setapak, zoomed in tight
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(KL_LON, KL_LAT, DEFAULT_CAMERA_HEIGHT_METERS),
        orientation: {
          heading: CesiumMath.toRadians(0),
          pitch: CesiumMath.toRadians(-70),
          roll: 0,
        },
      });

      // Dismiss loading overlay once tiles are ready
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

      // Set up dashboard visuals immediately
      if (!shouldStop()) {
        const v = viewer;
        setDashboardVisualMode(v).then((tileset) => {
          if (!shouldStop()) buildingsTileset = tileset;
        });
        removeCameraBoundsListener = lockCameraToMalaysia(v);
        enterDashboard(v);
        setPhase("DASHBOARD");
      }

      // Entity click handler
      clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction(
        (movement: { position: unknown }) => {
          if (shouldStop()) return;
          const v = viewer!;
          let picked;
          try {
            picked = v.scene.pick(movement.position as Cartesian2);
          } catch {
            return;
          }
          if (!defined(picked)) {
            // Clicked empty space — dismiss any open card
            setSelectedThreatId(null);
            return;
          }
          const entity = (picked as { id?: Entity }).id;
          if (entity?.id === `threat-${FLOOD_SIGNAL_THREAT_ID}`) {
            setSelectedThreatId(FLOOD_SIGNAL_THREAT_ID);
          } else if (entity && !entity.id?.startsWith("threat-")) {
            v.selectedEntity = entity;
          } else {
            setSelectedThreatId(null);
          }
        },
        ScreenSpaceEventType.LEFT_CLICK,
      );
    }

    initialize().catch((error) => {
      console.error("Failed to initialize Malaysia map", error);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      isCleaningUp = true;
      removeTileLoadListener?.();
      removeCameraBoundsListener?.();
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
      viewerRef.current = undefined;
    };
  }, []);

  // Show / hide evacuation route when flood hotspot is selected
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    if (selectedThreatId === FLOOD_SIGNAL_THREAT_ID) {
      const cleanup = addEvacuationRoute(viewer);
      return cleanup;
    }
  }, [selectedThreatId]);

  return (
    <main className="threat-experience">
      <div ref={containerRef} className="cesium-container" />
      {loading && <div className="loading-overlay">Loading terrain...</div>}
      <div className={`hud-overlay ${phase === "DASHBOARD" ? "active" : ""}`} />
      <MalaysiaUI phase={phase} onFlyTo={flyToLocation} selectedThreatId={selectedThreatId} onDismiss={() => setSelectedThreatId(null)} />
    </main>
  );
}
