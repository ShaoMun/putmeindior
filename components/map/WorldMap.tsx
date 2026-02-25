"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { geoMercator, geoPath, geoGraticule10 } from "d3-geo";
import * as topojson from "topojson-client";

interface UniverseMapProps {
  onRegionClick: (region: string) => void;
}

const CONSTANTS = {
  WIDTH: 1000,
  HEIGHT: 500,
};

// Precise lat/lon for hotspots
const HOTSPOTS = [
  { lon: 101.6869, lat: 3.139, color: "#ff453a", size: 5, label: "CRIT (KL)" },
  { lon: 10, lat: 51, color: "#ff9e45", size: 3, label: "MED" },
  { lon: -74, lat: 40, color: "#ff9e45", size: 3, label: "MED" },
  { lon: 20, lat: 0, color: "#ff453a", size: 4, label: "HIGH" },
  { lon: -60, lat: -15, color: "#3ee96a", size: 2.5, label: "LOW" },
  { lon: 135, lat: -25, color: "#ff9e45", size: 3, label: "MED" },
  { lon: 35, lat: 32, color: "#ff453a", size: 4, label: "HIGH" }, 
];

// Centers for continent text labels
const CONTINENT_LABELS = [
  { text: "NORTH AMERICA", lon: -100, lat: 45 },
  { text: "SOUTH AMERICA", lon: -60, lat: -15 },
  { text: "EUROPE", lon: 15, lat: 55 },
  { text: "AFRICA", lon: 20, lat: 5 },
  { text: "ASIA", lon: 95, lat: 45 },
  { text: "OCEANIA", lon: 140, lat: -25 },
];

// Area defining the "Asia" click target
const ASIA_BBOX = {
  minLon: 60,
  maxLon: 150,
  minLat: -10,
  maxLat: 55,
};

export default function UniverseMap({ onRegionClick }: UniverseMapProps) {
  const [visible, setVisible] = useState(false);
  const [landFeatures, setLandFeatures] = useState<any[]>([]);
  const [hoveredAsia, setHoveredAsia] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  
  // Animation state
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);

  useEffect(() => {
    setVisible(true);

    const interval = setInterval(() => {
      tickRef.current += 1;
      setTick(tickRef.current);
      setNow(new Date());
    }, 60);

    // Fetch topojson countries for realistic map with borders
    fetch("https://unpkg.com/world-atlas@2.0.2/countries-110m.json")
      .then((res) => res.json())
      .then((topology) => {
        // Feature collection of countries
        const geojson = topojson.feature(topology, topology.objects.countries) as any;
        setLandFeatures(geojson.features);
      })
      .catch((err) => console.error("Failed to load map data", err));

    return () => clearInterval(interval);
  }, []);

  // Map projection & path generator
  const projection = useMemo(() => {
    return geoMercator()
      .scale(150)
      .translate([CONSTANTS.WIDTH / 2, CONSTANTS.HEIGHT / 1.5]);
  }, []);

  const pathGenerator = useMemo(() => {
    return geoPath().projection(projection);
  }, [projection]);

  const graticule = useMemo(() => {
    return geoGraticule10();
  }, []);

  // Compute Asia bounding box path manually to create a glowing interactive region
  const asiaRegionPolygon = useMemo(() => {
    const coords = [
      [ASIA_BBOX.minLon, ASIA_BBOX.minLat],
      [ASIA_BBOX.maxLon, ASIA_BBOX.minLat],
      [ASIA_BBOX.maxLon, ASIA_BBOX.maxLat],
      [ASIA_BBOX.minLon, ASIA_BBOX.maxLat],
      [ASIA_BBOX.minLon, ASIA_BBOX.minLat],
    ];
    // Map to pixel coords and format as SVG path
    const points = coords.map((c) => projection(c as [number, number])!);
    if(points.some(p => !p)) return "";
    return `M ${points.map((p) => p.join(",")).join(" L ")} Z`;
  }, [projection]);

  const asiaCornerBrackets = useMemo(() => {
    const coords = [
      [ASIA_BBOX.minLon, ASIA_BBOX.minLat], // BL
      [ASIA_BBOX.maxLon, ASIA_BBOX.minLat], // BR
      [ASIA_BBOX.maxLon, ASIA_BBOX.maxLat], // TR
      [ASIA_BBOX.minLon, ASIA_BBOX.maxLat], // TL
    ];
    const points = coords.map((c) => projection(c as [number, number])!);
    if(points.some(p => !p)) return "";
    
    // tl is 3, tr is 2, br is 1, bl is 0
    const [bl, br, tr, tl] = points;
    const size = 15; // bracket length in pixels
    
    return `
      M ${tl[0]} ${tl[1] + size} L ${tl[0]} ${tl[1]} L ${tl[0] + size} ${tl[1]}
      M ${tr[0] - size} ${tr[1]} L ${tr[0]} ${tr[1]} L ${tr[0]} ${tr[1] + size}
      M ${br[0]} ${br[1] - size} L ${br[0]} ${br[1]} L ${br[0] - size} ${br[1]}
      M ${bl[0] + size} ${bl[1]} L ${bl[0]} ${bl[1]} L ${bl[0]} ${bl[1] - size}
    `;
  }, [projection]);

  const asiaCenter = projection([105, 20]);

  const pulseScale = (index: number) => {
    const offset = index * 18;
    return 1 + Math.sin((tick + offset) * 0.18) * 0.4;
  };

  const timeString = now 
    ? now.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).toUpperCase()
    : "";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(circle at 50% 50%, #061426 0%, #01040a 100%)",
        display: "flex",
        flexDirection: "column",
        opacity: visible ? 1 : 0,
        transition: "opacity 1s ease-out",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.8rem 1.8rem",
          borderBottom: "1px solid rgba(74, 158, 255, 0.15)",
          background: "linear-gradient(90deg, rgba(6,20,40,0.9), rgba(2,5,10,0.95))",
          backdropFilter: "blur(12px)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "1.1rem",
            fontWeight: 800,
            letterSpacing: "0.3em",
            color: "#e2f1ff",
            textShadow: "0 0 8px rgba(226, 241, 255, 0.4)",
          }}
        >
          JARVIS
        </span>
        <span
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "0.8rem",
            letterSpacing: "0.15em",
            color: "#a0b2c1",
            fontWeight: 600,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {timeString}
        </span>
      </div>

      {/* Map container */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${CONSTANTS.WIDTH} ${CONSTANTS.HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          <defs>
            <filter id="glow-map">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-strong">
              <feGaussianBlur stdDeviation="5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(74, 158, 255, 0.05)" strokeWidth="1"/>
            </pattern>
          </defs>

          {/* Background Grid */}
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Lat/Lon Graticule */}
          <path
            d={pathGenerator(graticule) || ""}
            fill="none"
            stroke="rgba(74, 158, 255, 0.12)"
            strokeWidth={0.5}
            strokeDasharray="2 4"
          />

          {/* Realistic Map Countries */}
          <g>
            {landFeatures.map((feature, i) => (
              <path
                key={i}
                d={pathGenerator(feature) || ""}
                fill="#121820"
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth={0.5}
                style={{
                  transition: "fill 0.2s"
                }}
              />
            ))}
          </g>

          {/* Continent Labels */}
          {CONTINENT_LABELS.map((label, idx) => {
            const pos = projection([label.lon, label.lat]);
            if (!pos) return null;
            const [cx, cy] = pos;
            
            // Offset Asia slightly to account for the deployment bounding box
            const offsetY = label.text === "ASIA" ? -25 : 0;
            
            return (
              <text
                key={idx}
                x={cx}
                y={cy + offsetY}
                textAnchor="middle"
                fill="#ffffff"
                opacity={0.9}
                fontSize="9"
                fontWeight="bold"
                fontFamily="Rajdhani, 'JetBrains Mono', monospace"
                letterSpacing="2.5"
                pointerEvents="none"
              >
                {label.text}
              </text>
            );
          })}

          {/* Interactive Asia Region Overlay */}
          <g
            onMouseEnter={() => setHoveredAsia(true)}
            onMouseLeave={() => setHoveredAsia(false)}
            onClick={() => onRegionClick("asia")}
            style={{ cursor: "pointer" }}
          >
            <path
              d={asiaRegionPolygon}
              fill={hoveredAsia ? "rgba(74, 158, 255, 0.12)" : "rgba(74, 158, 255, 0.04)"}
              stroke={hoveredAsia ? "rgba(74, 158, 255, 0.9)" : "rgba(74, 158, 255, 0.3)"}
              strokeWidth={hoveredAsia ? 1.5 : 1}
              strokeDasharray={hoveredAsia ? "none" : "6 4"}
              filter="url(#glow-map)"
              style={{ transition: "all 0.3s ease" }}
            />
            <path
              d={asiaCornerBrackets}
              fill="none"
              stroke={hoveredAsia ? "rgba(74, 158, 255, 1)" : "rgba(74, 158, 255, 0.6)"}
              strokeWidth={hoveredAsia ? 2.5 : 1.5}
              filter="url(#glow-strong)"
              style={{ transition: "all 0.3s ease", pointerEvents: "none" }}
            />
            {asiaCenter && hoveredAsia && (
              <text
                x={asiaCenter[0] - 10}
                y={asiaCenter[1] - 40}
                fill="#fff"
                fontSize="11"
                fontWeight="700"
                letterSpacing="4"
                pointerEvents="none"
                filter="url(#glow-map)"
                style={{ transition: "fill 0.3s" }}
              >
                CLICK TO DEPLOY
              </text>
            )}
          </g>

          {/* Hotspot Indicators */}
          {HOTSPOTS.map((h, i) => {
            const pos = projection([h.lon, h.lat]);
            if (!pos) return null;
            const [cx, cy] = pos;
            const scale = pulseScale(i);

            return (
              <g key={i}>
                {/* Outward propagating ripple */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={h.size * 3 * scale}
                  fill="none"
                  stroke={h.color}
                  strokeWidth={0.8}
                  opacity={0.4 / scale}
                />
                
                {/* Inner glowing dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={h.size}
                  fill={h.color}
                  filter="url(#glow-strong)"
                />
                
                {/* Connecting lines for aesthetics (only drawing for a few) */}
                {i > 0 && i < 4 && (
                  <path
                    d={`M ${projection([HOTSPOTS[0].lon, HOTSPOTS[0].lat])![0]} ${projection([HOTSPOTS[0].lon, HOTSPOTS[0].lat])![1]} Q ${(cx + projection([HOTSPOTS[0].lon, HOTSPOTS[0].lat])![0])/2} ${cy - 40} ${cx} ${cy}`}
                    fill="none"
                    stroke={h.color}
                    strokeWidth={0.5}
                    opacity={0.2}
                    strokeDasharray="2 3"
                  />
                )}
              </g>
            );
          })}
          
          {/* Target reticle for KL */}
          {(() => {
             const klPos = projection([101.6869, 3.139]);
             if(!klPos) return null;
             return (
               <g transform={`translate(${klPos[0]}, ${klPos[1]})`} style={{ pointerEvents: 'none' }}>
                 <circle r="12" fill="none" stroke="rgba(255,69,58,0.8)" strokeWidth="1" strokeDasharray="4 2" />
                 <path d="M -16 0 L -8 0 M 16 0 L 8 0 M 0 -16 L 0 -8 M 0 16 L 0 8" stroke="rgba(255,69,58,0.9)" strokeWidth="1.5" />
                 <text x="18" y="3" fill="#FFAE00" fontSize="8" fontWeight="bold" letterSpacing="1">KUALA LUMPUR</text>
               </g>
             )
          })()}
        </svg>

        {/* Framing / HUD Elements */}
        
        {/* Top Left Frame */}
        <div style={{ position: "absolute", top: 20, left: 20, width: 40, height: 40, borderTop: "2px solid rgba(74,158,255,0.6)", borderLeft: "2px solid rgba(74,158,255,0.6)" }} />
        {/* Top Right Frame */}
        <div style={{ position: "absolute", top: 20, right: 20, width: 40, height: 40, borderTop: "2px solid rgba(74,158,255,0.6)", borderRight: "2px solid rgba(74,158,255,0.6)" }} />
        {/* Bottom Left Frame */}
        <div style={{ position: "absolute", bottom: 20, left: 20, width: 40, height: 40, borderBottom: "2px solid rgba(74,158,255,0.6)", borderLeft: "2px solid rgba(74,158,255,0.6)" }} />
        {/* Bottom Right Frame */}
        <div style={{ position: "absolute", bottom: 20, right: 20, width: 40, height: 40, borderBottom: "2px solid rgba(74,158,255,0.6)", borderRight: "2px solid rgba(74,158,255,0.6)" }} />

        {/* Bottom Legend Overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "2rem",
            padding: "0.6rem 1.4rem",
            background: "rgba(4,10,20,0.85)",
            border: "1px solid rgba(74,158,255,0.25)",
            backdropFilter: "blur(4px)",
            borderRadius: 6,
            boxShadow: "0 0 15px rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        >
          {[
            { color: "#ff453a", label: "CRITICAL THREAT" },
            { color: "#ff9e45", label: "ELEVATED RISK" },
            { color: "#3ee96a", label: "MONITORING" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  boxShadow: `0 0 8px ${color}`,
                }}
              />
              <span
                style={{
                  fontSize: "0.65rem",
                  letterSpacing: "0.15em",
                  color: "#a0b2c1",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
