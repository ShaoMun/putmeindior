"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

type AppPhase = "EARTH_INTRO" | "UNIVERSE_MAP" | "CESIUM";

const EarthIntro = dynamic(() => import("@/components/EarthIntro"), { ssr: false });
const UniverseMap = dynamic(() => import("@/components/UniverseMap"), { ssr: false });
const CesiumExperience = dynamic(() => import("@/components/CesiumExperience"), { ssr: false });

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("EARTH_INTRO");
  const [cesiumMounted, setCesiumMounted] = useState(false);

  const handleEarthZoomComplete = () => {
    setPhase("UNIVERSE_MAP");
  };

  const handleRegionClick = (region: string) => {
    if (region === "asia") {
      // Pre-mount Cesium, then transition
      setCesiumMounted(true);
      setTimeout(() => setPhase("CESIUM"), 60);
    }
  };

  return (
    <main
      style={{
        position: "relative",
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: "#020408",
      }}
    >
      {/* Layer 1: Earth Intro (Three.js) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: phase === "EARTH_INTRO" ? 1 : 0,
          pointerEvents: phase === "EARTH_INTRO" ? "auto" : "none",
          transition: "opacity 0.6s ease",
          zIndex: phase === "EARTH_INTRO" ? 30 : 10,
        }}
      >
        {phase === "EARTH_INTRO" && (
          <EarthIntro onZoomComplete={handleEarthZoomComplete} />
        )}
      </div>

      {/* Layer 2: Universe Map */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: phase === "UNIVERSE_MAP" ? 1 : 0,
          pointerEvents: phase === "UNIVERSE_MAP" ? "auto" : "none",
          transition: "opacity 0.7s ease",
          zIndex: phase === "UNIVERSE_MAP" ? 30 : 10,
        }}
      >
        {(phase === "UNIVERSE_MAP" || phase === "CESIUM") && (
          <UniverseMap onRegionClick={handleRegionClick} />
        )}
      </div>

      {/* Layer 3: Cesium Malaysia Dashboard */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: phase === "CESIUM" ? 1 : 0,
          pointerEvents: phase === "CESIUM" ? "auto" : "none",
          transition: "opacity 0.8s ease",
          zIndex: phase === "CESIUM" ? 30 : 5,
        }}
      >
        {cesiumMounted && <CesiumExperience />}
      </div>
    </main>
  );
}
