"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeviceLocation, GpsMode } from "@/components/scope/simulation";

export type GpsStatus = "demo" | "locating" | "live" | "denied" | "unsupported" | "error";

const DEMO_LOCATION: DeviceLocation = {
  lat: 3.139,
  lng: 101.6869,
  accuracy: 22,
};

export function useDeviceLocation(mode: GpsMode): {
  location: DeviceLocation;
  status: GpsStatus;
  errorMessage: string | null;
  resetLiveState: () => void;
} {
  const [location, setLocation] = useState<DeviceLocation>(DEMO_LOCATION);
  const [liveStatus, setLiveStatus] = useState<"live" | "denied" | "error" | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const isSupported = typeof window !== "undefined" && "geolocation" in navigator;

  useEffect(() => {
    if (mode !== "live") {
      return;
    }

    if (!isSupported) {
      return;
    }

    const onSuccess = (position: GeolocationPosition) => {
      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setLiveStatus("live");
      setLiveError(null);
    };

    const onError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        setLiveStatus("denied");
        setLiveError("Permission denied. Falling back to demo location.");
        return;
      }

      setLiveStatus("error");
      setLiveError("Unable to read GPS location. Using fallback behavior.");
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000,
    });

    const watcherId = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watcherId);
    };
  }, [isSupported, mode]);

  const resolvedLocation = useMemo(() => {
    if (mode === "demo") {
      return DEMO_LOCATION;
    }

    return location;
  }, [location, mode]);

  const status: GpsStatus = useMemo(() => {
    if (mode === "demo") {
      return "demo";
    }

    if (!isSupported) {
      return "unsupported";
    }

    return liveStatus ?? "locating";
  }, [isSupported, liveStatus, mode]);

  const errorMessage = useMemo(() => {
    if (mode === "demo") {
      return null;
    }

    if (!isSupported) {
      return "Geolocation is not supported in this browser.";
    }

    return liveError;
  }, [isSupported, liveError, mode]);

  const resetLiveState = () => {
    setLiveStatus(null);
    setLiveError(null);
  };

  return { location: resolvedLocation, status, errorMessage, resetLiveState };
}
