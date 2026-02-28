"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

/** Only call setOptions once per app lifecycle (loader requirement). */
let mapsOptionsSet = false;

export interface StreetViewPosition {
  lat: number;
  lng: number;
}

export function useStreetView(
  containerRef: React.RefObject<HTMLDivElement | null>,
  initialPosition: StreetViewPosition
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);

  const moveForward = useCallback(() => {
    const panorama = panoramaRef.current;
    if (!panorama) return;
    const links = panorama.getLinks();
    if (!links || links.length === 0) return;
    const first = links[0];
    if (!first) return;
    const pov = panorama.getPov();
    let best = first;
    let bestDiff = Math.abs((first.heading ?? 0) - (pov.heading ?? 0));
    if (bestDiff > 180) bestDiff = 360 - bestDiff;
    for (let i = 1; i < links.length; i++) {
      const link = links[i];
      if (!link) continue;
      const diff = Math.abs((link.heading ?? 0) - (pov.heading ?? 0));
      const normalized = diff > 180 ? 360 - diff : diff;
      if (normalized < bestDiff) {
        bestDiff = normalized;
        best = link;
      }
    }
    if (best.pano) panorama.setPano(best.pano);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const apiKey =
      typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        : "";

    if (!apiKey) {
      setError("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
      return;
    }

    let cancelled = false;
    if (!mapsOptionsSet) {
      setOptions({ key: apiKey, v: "weekly" });
      mapsOptionsSet = true;
    }

    importLibrary("maps")
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const panorama = new google.maps.StreetViewPanorama(container, {
          position: initialPosition,
          pov: { heading: 34, pitch: 10 },
          zoom: 1,
          addressControl: true,
          linksControl: true,
          panControl: true,
          enableCloseButton: false,
        });
        panoramaRef.current = panorama;
        panorama.addListener("position_changed", () => {
          if (!cancelled) setReady(true);
        });
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err ?? "");
          const name = err instanceof Error ? err.name : "";
          const full = `${name} ${msg}`.trim();
          const isApiNotActivated =
            name === "ApiNotActivatedMapError" ||
            /ApiNotActivatedMapError|ApiNotActivated/i.test(msg) ||
            /ApiNotActivatedMapError|ApiNotActivated/i.test(full);
          if (isApiNotActivated) {
            setError(
              "Maps API not enabled. In Google Cloud Console, enable Maps JavaScript API (and Street View) for this project and ensure your API key is allowed to use it."
            );
          } else {
            setError(msg || "Failed to load Street View");
          }
        }
      });

    return () => {
      cancelled = true;
      if (panoramaRef.current) {
        panoramaRef.current = null;
      }
    };
  }, [initialPosition.lat, initialPosition.lng]);

  return {
    panoramaRef,
    moveForward,
    ready,
    error,
  };
}
