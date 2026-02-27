"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Layers, Crosshair, Flame } from "lucide-react";
import { WEST_MALAYSIA_LOCATIONS } from "./constants";
import "./malaysia-ui.css";

interface MalaysiaUIProps {
  phase: "LOADING" | "DASHBOARD";
  onFlyTo: (lat: number, lon: number) => void;
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

export default function MalaysiaUI({ phase, onFlyTo }: MalaysiaUIProps) {
  const [targetSelected, setTargetSelected] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

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

      {/* 2. The Right Sidebar (Info Card) */}
      <div className="malaysia-ui-infocard frosted-panel">
        <div className="header">
          <h2 className="title">Menara Ampang</h2>
          <p className="subtitle">Sector 7G</p>
        </div>

        <div className="data-rows">
          <div className="data-row">
            <span className="label">Risk Level</span>
            <span className="val-critical">CRITICAL</span>
          </div>
          <div className="data-row">
            <span className="label">Occupancy</span>
            <span className="val-white">~42</span>
          </div>
          <div className="data-row">
            <span className="label">Structure</span>
            <span className="val-grey">Concrete</span>
          </div>
        </div>

        <button
          className="action-btn"
          onClick={() => setTargetSelected(!targetSelected)}
        >
          Analyze Target
        </button>
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
