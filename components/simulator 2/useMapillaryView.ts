"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Viewer } from "mapillary-js";

const MAPILLARY_GRAPH = "https://graph.mapillary.com";

const LOG_PREFIX = "[Mapillary]";

/** Bearing in degrees from A to B (0 = North, 90 = East), clockwise. */
function bearingDegrees(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const dLon = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export interface MapillaryPosition {
  lat: number;
  lng: number;
}

/** Fetch image IDs in a bbox. Set panoOnly false to allow any image when no panos. */
async function fetchImagesInBbox(
  token: string,
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
  panoOnly = true
): Promise<{ id: string; sequence: string }[]> {
  const bbox = [minLon, minLat, maxLon, maxLat].join(",");
  const panoParam = panoOnly ? "&is_pano=true" : "";
  const url = `${MAPILLARY_GRAPH}/images?access_token=${encodeURIComponent(token)}&fields=id,sequence&bbox=${bbox}${panoParam}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapillary API: ${res.status}`);
  const json = (await res.json()) as { data?: { id: string | number; sequence: string }[] };
  const data = json?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((i) => i != null && (i.id !== undefined && i.id !== null) && i.sequence)
    .map((i) => ({ id: String(i.id), sequence: String(i.sequence) }));
}

/** Fetch ordered image IDs in a sequence. */
async function fetchSequenceImageIds(
  token: string,
  sequenceId: string
): Promise<string[]> {
  const url = `${MAPILLARY_GRAPH}/image_ids?sequence_id=${encodeURIComponent(sequenceId)}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapillary sequence: ${res.status}`);
  const json = (await res.json()) as { data?: (string | { id: string | number })[] };
  const data = json?.data;
  if (!Array.isArray(data)) return [];
  return data.map((item) =>
    typeof item === "string" ? item : String((item as { id: string | number }).id)
  );
}

export interface UseMapillaryViewOptions {
  /** Ref to set from the caller with their click handler (e.g. moveForward). Avoids circular reference. */
  onViewClickRef?: React.MutableRefObject<(() => void) | undefined>;
}

export function useMapillaryView(
  containerRef: React.RefObject<HTMLDivElement | null>,
  initialPosition: MapillaryPosition,
  options: UseMapillaryViewOptions = {}
) {
  const { onViewClickRef } = options;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const sequenceIdsRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastViewClickTimeRef = useRef(0);
  const VIEW_CLICK_THROTTLE_MS = 400;

  const moveForward = useCallback(() => {
    const viewer = viewerRef.current;
    const ids = sequenceIdsRef.current;
    if (!viewer || ids.length === 0) return;
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= ids.length) return;
    currentIndexRef.current = nextIndex;
    viewer.moveTo(ids[nextIndex]).catch(() => {});
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const token =
      typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN
        ? process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN
        : "";

    if (!token) {
      setError("Missing NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN");
      return;
    }

    let cancelled = false;

    const init = async () => {
      try {
        const { lat, lng } = initialPosition;
        // Try progressively: larger bbox (panos only) -> any image -> fallback (Singapore)
        const deltas = [0.02, 0.05, 0.1];
        let images: { id: string; sequence: string }[] = [];
        for (const delta of deltas) {
          images = await fetchImagesInBbox(
            token,
            lng - delta,
            lat - delta,
            lng + delta,
            lat + delta,
            true
          );
          if (cancelled) return;
          if (images.length > 0) break;
        }
        if (images.length === 0) {
          for (const delta of deltas) {
            images = await fetchImagesInBbox(
              token,
              lng - delta,
              lat - delta,
              lng + delta,
              lat + delta,
              false
            );
            if (cancelled) return;
            if (images.length > 0) break;
          }
        }
        if (images.length === 0) {
          const fallbackLng = 103.85;
          const fallbackLat = 1.29;
          images = await fetchImagesInBbox(
            token,
            fallbackLng - 0.03,
            fallbackLat - 0.03,
            fallbackLng + 0.03,
            fallbackLat + 0.03,
            false
          );
          if (cancelled) return;
        }
        if (images.length === 0) {
          setError("No Mapillary imagery at this location. Try another area.");
          return;
        }
        const first = images[0];
        const sequenceIds = await fetchSequenceImageIds(token, first.sequence);
        if (cancelled) return;
        sequenceIdsRef.current = sequenceIds.length > 0 ? sequenceIds : [first.id];
        currentIndexRef.current = 0;

        const viewer = new Viewer({
          accessToken: token,
          container,
          imageId: first.id,
          component: {
            cover: false,
            direction: false,
            keyboard: false,
            zoom: false,
            sequence: false,
          },
        });
        if (cancelled) {
          viewer.remove();
          return;
        }
        viewerRef.current = viewer;
        viewer.on("load", () => {
          if (cancelled) return;
          viewer.deactivateCover();
          // Zoom in one step (zoom is in [0, 3])
          viewer.getZoom().then((z) => {
            if (!cancelled && viewerRef.current === viewer) {
              viewer.setZoom(Math.min(3, z + 1));
            }
          });
          setReady(true);
        });
        viewer.on("image", (event: { image: { id: string; lngLat: { lat: number; lng: number }; compassAngle: number } }) => {
          const ids = sequenceIdsRef.current;
          const id = String(event.image.id);
          const idx = ids.indexOf(id);
          if (idx >= 0) currentIndexRef.current = idx;
          const lat = event.image.lngLat?.lat;
          const lng = event.image.lngLat?.lng;
          const facing = event.image.compassAngle ?? 0;
          if (typeof lat === "number" && typeof lng === "number") {
            lastPositionRef.current = { lat, lng };
            console.log(
              `${LOG_PREFIX} coordinate: { lat: ${lat}, lng: ${lng} }, facing: ${facing.toFixed(1)}° (0=North, 90=East, clockwise)`
            );
          }
        });
        let lastBearingLog = 0;
        viewer.on("bearing", (event: { bearing: number }) => {
          const now = Date.now();
          if (now - lastBearingLog < 300) return;
          lastBearingLog = now;
          console.log(
            `${LOG_PREFIX} bearing (view direction): ${event.bearing.toFixed(1)}° (0=North, 90=East, clockwise)`
          );
        });
        viewer.on("click", (event: { lngLat: { lat: number; lng: number } | null; pixelPoint: number[] }) => {
          const now = Date.now();
          if (now - lastViewClickTimeRef.current >= VIEW_CLICK_THROTTLE_MS) {
            lastViewClickTimeRef.current = now;
            onViewClickRef?.current?.();
          }
          const from = lastPositionRef.current;
          const to = event.lngLat;
          if (from && to) {
            const clickBearing = bearingDegrees(from, to);
            console.log(
              `${LOG_PREFIX} click at: { lat: ${to.lat}, lng: ${to.lng} }, clicking direction: ${clickBearing.toFixed(1)}° (0=North, 90=East, clockwise)`
            );
          } else if (to) {
            console.log(
              `${LOG_PREFIX} click at: { lat: ${to.lat}, lng: ${to.lng} } (current position unknown, direction not computed)`
            );
          }
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Mapillary");
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        viewerRef.current.remove();
        viewerRef.current = null;
      }
      sequenceIdsRef.current = [];
    };
  }, [initialPosition.lat, initialPosition.lng]);

  return {
    moveForward,
    ready,
    error,
  };
}
