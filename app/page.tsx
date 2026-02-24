"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

type AppPhase = "EARTH_INTRO" | "WORLD_MAP" | "MALAYSIA";

const EarthIntro = dynamic(() => import("@/components/earth/EarthIntro"), { ssr: false });
const WorldMap = dynamic(() => import("@/components/map/WorldMap"), { ssr: false });
const MalaysiaMap = dynamic(() => import("@/components/malaysia/MalaysiaMap"), { ssr: false });

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("EARTH_INTRO");
  const [malaysiaMounted, setMalaysiaMounted] = useState(false);

  const handleEarthZoomComplete = () => {
    setPhase("WORLD_MAP");
  };

  const handleRegionClick = (region: string) => {
    if (region === "asia") {
      setMalaysiaMounted(true);
      setTimeout(() => setPhase("MALAYSIA"), 60);
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
      {/* Phase 1: Three.js Earth */}
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

      {/* Phase 2: World Map */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: phase === "WORLD_MAP" ? 1 : 0,
          pointerEvents: phase === "WORLD_MAP" ? "auto" : "none",
          transition: "opacity 0.7s ease",
          zIndex: phase === "WORLD_MAP" ? 30 : 10,
        }}
      >
        {(phase === "WORLD_MAP" || phase === "MALAYSIA") && (
          <WorldMap onRegionClick={handleRegionClick} />
        )}
      </div>

      {/* Phase 3: Malaysia Cesium */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: phase === "MALAYSIA" ? 1 : 0,
          pointerEvents: phase === "MALAYSIA" ? "auto" : "none",
          transition: "opacity 0.8s ease",
          zIndex: phase === "MALAYSIA" ? 30 : 5,
        }}
      >
        {malaysiaMounted && <MalaysiaMap />}
      </div>
    </main>
  );
}
