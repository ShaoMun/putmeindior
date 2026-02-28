"use client";

import { useRef, useState, useCallback } from "react";
import Earth, { type GlobeHandle } from "@/components/ui/globe";

interface EarthIntroProps {
  onZoomComplete: () => void;
}

// Threat markers on land — [lat, lng], size
const THREAT_MARKERS = [
  { location: [3.139, 101.687] as [number, number], size: 0.1 },     // KL (Primary)
  { location: [40.7128, -74.006] as [number, number], size: 0.04 },  // NYC
  { location: [51.5074, -0.1278] as [number, number], size: 0.05 },  // London
  { location: [-33.8688, 151.2093] as [number, number], size: 0.04 },// Sydney
  { location: [35.6762, 139.6503] as [number, number], size: 0.08 }, // Tokyo
  { location: [48.8566, 2.3522] as [number, number], size: 0.03 },   // Paris
  { location: [55.7558, 37.6173] as [number, number], size: 0.06 },  // Moscow
  { location: [-23.5505, -46.6333] as [number, number], size: 0.05 },// Sao Paulo
  { location: [28.6139, 77.209] as [number, number], size: 0.07 },   // Delhi
  { location: [30.0444, 31.2357] as [number, number], size: 0.04 },  // Cairo
  { location: [1.3521, 103.8198] as [number, number], size: 0.08 },  // Singapore
  { location: [-1.2921, 36.8219] as [number, number], size: 0.03 },  // Nairobi
  { location: [39.9042, 116.4074] as [number, number], size: 0.09 }, // Beijing
  { location: [34.0522, -118.2437] as [number, number], size: 0.05 },// LA
  { location: [31.2304, 121.4737] as [number, number], size: 0.08 }, // Shanghai
  { location: [52.5200, 13.4050] as [number, number], size: 0.04 },  // Berlin
  { location: [25.2048, 55.2708] as [number, number], size: 0.06 },  // Dubai
  { location: [14.5995, 120.9842] as [number, number], size: 0.07 }, // Manila
  { location: [4.6097, -74.0817] as [number, number], size: 0.04 },  // Bogota
  { location: [19.4326, -99.1332] as [number, number], size: 0.05 }, // Mexico City
  { location: [6.5244, 3.3792] as [number, number], size: 0.06 },    // Lagos
  { location: [-26.2041, 28.0473] as [number, number], size: 0.04 }, // Johannesburg
  { location: [35.6892, 51.3890] as [number, number], size: 0.05 },  // Tehran
  { location: [37.7749, -122.4194] as [number, number], size: 0.04 },// SF
  { location: [22.3193, 114.1694] as [number, number], size: 0.07 }, // Hong Kong
  { location: [-34.6037, -58.3816] as [number, number], size: 0.03 },// Buenos Aires
  { location: [45.4215, -75.6972] as [number, number], size: 0.02 }, // Ottawa
  { location: [38.9072, -77.0369] as [number, number], size: 0.06 }, // DC
  { location: [41.0082, 28.9784] as [number, number], size: 0.05 },  // Istanbul
  { location: [13.7563, 100.5018] as [number, number], size: 0.06 }, // Bangkok
  { location: [-6.2088, 106.8456] as [number, number], size: 0.08 }, // Jakarta
  { location: [23.8103, 90.4125] as [number, number], size: 0.05 },  // Dhaka
];

export default function EarthIntro({ onZoomComplete }: EarthIntroProps) {
  const onZoomCompleteRef = useRef(onZoomComplete);
  onZoomCompleteRef.current = onZoomComplete;

  const globeRef = useRef<GlobeHandle>(null);
  const [animating, setAnimating] = useState(false);
  const [containerOpacity, setContainerOpacity] = useState(1);
  const [containerScale, setContainerScale] = useState(1);

  const handleClick = useCallback(() => {
    if (animating) return;
    setAnimating(true);

    // Clean, sensible transition: Stop rendering UI elements, slowly zoom the camera into 
    // the globe via a scale transform, and crossfade to black/transparent 
    // to gracefully reveal the Flat Map underneath.
    
    setContainerScale(1.8);
    setContainerOpacity(0);

    setTimeout(() => {
      onZoomCompleteRef.current();
    }, 700);

  }, [animating]);

  return (
    <div
      onClick={handleClick}
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at 50% 60%, #050a10 0%, #000000 70%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: animating ? "default" : "pointer",
        opacity: containerOpacity,
        transform: `scale(${containerScale})`,
        transition: "opacity 0.7s ease-out, transform 0.7s ease-in",
      }}
    >
      <div className="flex flex-col items-center justify-center w-full h-full relative">
        <Earth
          ref={globeRef}
          className="w-[calc(min(90vw,90vh,800px))] aspect-square"
          dark={1}
          scale={1.1}
          diffuse={1.2}
          mapSamples={40000}
          mapBrightness={6}
          baseColor={[0.4, 0.6509, 1]}
          markerColor={[1, 0.3, 0]} // Vibrant orange/red hybrid
          glowColor={[0.2745, 0.5765, 0.898]}
          markers={THREAT_MARKERS}
        />
      </div>

      {/* Click hint */}
      {!animating && (
        <span
          className="absolute bottom-8"
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.25em",
            color: "rgba(74, 158, 255, 0.5)",
            fontFamily: "Rajdhani, monospace",
            textTransform: "uppercase",
            animation: "pulse 2s ease-in-out infinite",
          }}
        >
          Click to proceed
        </span>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}
