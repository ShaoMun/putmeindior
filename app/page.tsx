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

  const showEarth = phase === "EARTH_INTRO";
  const showMap = phase === "WORLD_MAP" || phase === "MALAYSIA";

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-[#020408]">
      {/* Phase 1: Cobe Earth Globe */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          showEarth ? "opacity-100 pointer-events-auto z-30" : "opacity-0 pointer-events-none z-10"
        }`}
      >
        {showEarth && <EarthIntro onZoomComplete={handleEarthZoomComplete} />}
      </div>

      {/* Phase 2: World Map */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          showMap ? "opacity-100" : "opacity-0"
        } ${phase === "WORLD_MAP" ? "pointer-events-auto z-[25]" : "pointer-events-none z-10"}`}
      >
        {showMap && <WorldMap onRegionClick={handleRegionClick} />}
      </div>

      {/* Phase 3: Malaysia Cesium */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
          phase === "MALAYSIA" ? "opacity-100 pointer-events-auto z-30" : "opacity-0 pointer-events-none z-0"
        }`}
      >
        {malaysiaMounted && <MalaysiaMap />}
      </div>
    </main>
  );
}
