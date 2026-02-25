"use client";

import { useRef } from "react";
import Earth from "@/components/ui/globe";

interface EarthIntroProps {
  onZoomComplete: () => void;
}

export default function EarthIntro({ onZoomComplete }: EarthIntroProps) {
  const onZoomCompleteRef = useRef(onZoomComplete);
  onZoomCompleteRef.current = onZoomComplete;

  return (
    <div
      onClick={() => onZoomCompleteRef.current()}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: "radial-gradient(ellipse at 50% 60%, #050a10 0%, #000000 70%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      <Earth
        className="max-w-[800px]"
        dark={1}
        scale={1.1}
        diffuse={1.2}
        mapSamples={40000}
        mapBrightness={6}
        baseColor={[0.4, 0.6509, 1]}
        markerColor={[1, 0, 0]}
        glowColor={[0.2745, 0.5765, 0.898]}
      />
      <span
        style={{
          marginTop: "-2rem",
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
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}
