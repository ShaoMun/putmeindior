"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Layers, Crosshair, Flame, X, Droplets, AlertTriangle, Clock, MapPin, Shield } from "lucide-react";
import { WEST_MALAYSIA_LOCATIONS } from "./constants";
import { FLOOD_SIGNAL_THREAT_ID } from "./cesium-helpers";
import { threats } from "@/lib/threats";
import "./malaysia-ui.css";

interface MalaysiaUIProps {
  phase: "LOADING" | "DASHBOARD";
  onFlyTo: (lat: number, lon: number) => void;
  selectedThreatId: string | null;
  onDismiss: () => void;
}

interface Location {
  name: string;
  lat: number;
  lon: number;
}

/** Simple fuzzy match: returns true if all chars in query appear in order inside str */
function fuzzyMatch(str: string, query: string): boolean {
  const s = str.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return false;
  let si = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = s.indexOf(q[qi], si);
    if (idx === -1) return false;
    si = idx + 1;
  }
  return true;
}

/** Try to parse a "lat,lon" or "lat, lon" coordinate string */
function tryParseCoords(raw: string): { lat: number; lon: number } | null {
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lon)) return null;
  // Restrict to West Malaysia bounds
  if (lat < 0.8 || lat > 7.5 || lon < 99.5 || lon > 109.4) return null;
  return { lat, lon };
}

/** Get the flood threat data for the selected hotspot */
function getFloodThreat() {
  return threats.find((t) => t.id === FLOOD_SIGNAL_THREAT_ID) ?? null;
}

export default function MalaysiaUI({ phase, onFlyTo, selectedThreatId, onDismiss }: MalaysiaUIProps) {
  const [targetSelected, setTargetSelected] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const showFloodCard = selectedThreatId === FLOOD_SIGNAL_THREAT_ID;
  const floodThreat = showFloodCard ? getFloodThreat() : null;

  // Recompute suggestions whenever query changes
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowDrop(false);
      return;
    }
    const coords = tryParseCoords(query);
    if (coords) {
      setSuggestions([{ name: `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`, ...coords }]);
      setShowDrop(true);
      return;
    }
    const matched = WEST_MALAYSIA_LOCATIONS.filter((loc) => fuzzyMatch(loc.name, query)).slice(0, 6);
    setSuggestions(matched);
    setShowDrop(matched.length > 0);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = useCallback((loc: Location) => {
    setQuery(loc.name);
    setShowDrop(false);
    onFlyTo(loc.lat, loc.lon);
    inputRef.current?.blur();
  }, [onFlyTo]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && suggestions.length > 0) {
      handleSelect(suggestions[0]);
    }
    if (e.key === "Escape") {
      setShowDrop(false);
    }
  };

  return (
    <div className={`malaysia-ui-wrapper ${phase === "DASHBOARD" ? "active" : "hidden"}`}>
      {/* 1. The Search Bar */}
      <div className="malaysia-ui-search-wrapper">
        <div className="malaysia-ui-search frosted-panel">
          <div className="icon">
            <Search size={18} />
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search city or coordinates..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setShowDrop(suggestions.length > 0)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        </div>

        {/* Suggestions dropdown */}
        {showDrop && suggestions.length > 0 && (
          <div
            ref={dropRef}
            className="malaysia-ui-suggestions frosted-panel"
          >
            {suggestions.map((loc) => (
              <button
                key={`${loc.name}-${loc.lat}`}
                className="suggestion-item"
                onMouseDown={() => handleSelect(loc)}
              >
                <span className="suggestion-name">{loc.name}</span>
                <span className="suggestion-coords">
                  {loc.lat.toFixed(3)}°N, {loc.lon.toFixed(3)}°E
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Flood Alert Card (Right Sidebar) — only when hotspot is clicked */}
      <div className={`malaysia-ui-infocard frosted-panel ${showFloodCard ? "visible" : ""}`}>
        {floodThreat && (
          <>
            {/* Dismiss button */}
            <button className="dismiss-btn" onClick={onDismiss}>
              <X size={16} />
            </button>

            {/* Header */}
            <div className="header">
              <div className="alert-badge flood">
                <Droplets size={14} />
                <span>FLOOD ALERT</span>
              </div>
              <h2 className="title">Kampung Baru</h2>
              <p className="subtitle">
                <MapPin size={12} style={{ display: "inline", marginRight: 4 }} />
                {floodThreat.lat.toFixed(4)}°N, {floodThreat.lon.toFixed(4)}°E
              </p>
            </div>

            {/* Probability gauge */}
            <div className="probability-section">
              <div className="prob-header">
                <AlertTriangle size={14} />
                <span className="label">Flood Probability</span>
              </div>
              <div className="prob-bar-track">
                <div
                  className="prob-bar-fill"
                  style={{ width: `${floodThreat.probability * 100}%` }}
                />
              </div>
              <span className="prob-value">{(floodThreat.probability * 100).toFixed(0)}%</span>
            </div>

            {/* Time estimate */}
            <div className="data-rows">
              <div className="data-row">
                <span className="label"><Clock size={12} /> Est. Time to Onset</span>
                <span className="val-warning">~2h 15min</span>
              </div>
              <div className="data-row">
                <span className="label"><Droplets size={12} /> Rainfall (6h)</span>
                <span className="val-white">{floodThreat.drivers.rainfall_6h_mm} mm</span>
              </div>
              <div className="data-row">
                <span className="label">Soil Wetness</span>
                <span className="val-white">{(floodThreat.drivers.soil_wetness * 100).toFixed(0)}%</span>
              </div>
              <div className="data-row">
                <span className="label">Terrain Slope</span>
                <span className="val-grey">{(floodThreat.drivers.slope * 100).toFixed(1)}%</span>
              </div>
            </div>

            {/* Reasoning */}
            <div className="reasoning-section">
              <div className="section-header">
                <AlertTriangle size={13} />
                <span>Analysis</span>
              </div>
              <p className="reasoning-text">
                Continuous heavy rainfall of {floodThreat.drivers.rainfall_6h_mm}mm over the past 6 hours coupled with
                {" "}{(floodThreat.drivers.soil_wetness * 100).toFixed(0)}% soil saturation in the Kampung Baru
                low-lying basin. Historical drainage capacity of Sungai Klang is likely exceeded.
                Flash flood conditions expected within 2–3 hours.
              </p>
            </div>

            {/* Evacuation */}
            <div className="evac-section">
              <div className="section-header evac">
                <Shield size={13} />
                <span>Evacuation Plan</span>
              </div>
              <ul className="evac-list">
                <li>Move to higher ground above Jalan Raja Muda</li>
                <li>Proceed to Dewan Komuniti Kampung Baru (600m NW)</li>
                <li>Avoid Sungai Klang riverbank and underpasses</li>
                <li>Emergency hotline: <strong>999</strong> / NADMA: <strong>03-8064 2400</strong></li>
              </ul>
            </div>
          </>
        )}
      </div>

      {/* 3. The Bottom Bar (The Tray) */}
      <div className="malaysia-ui-tray-container">
        <div className={`malaysia-ui-tray frosted-panel ${targetSelected ? "expanded" : ""}`}>
          <button className="icon-btn">
            <Layers size={20} />
          </button>
          <button className="icon-btn">
            <Crosshair size={20} />
          </button>
          <button className="icon-btn">
            <Flame size={20} />
          </button>

          {targetSelected && (
            <button className="live-info-btn">
              LIVE INFO
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
