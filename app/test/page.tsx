"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import Leaflet map (SSR disabled — Leaflet needs window)
const MapSection = dynamic(() => import("./MapSection"), { ssr: false });

type Layer = {
  name: string;
  thumbnailUrl: string;
  stats: Record<string, number | null>;
};

const FLOOD_INFO = {
  title: "Flood Monitoring",
  description:
    "Monitoring potential flood conditions around Kuala Lumpur using satellite radar and rainfall data.",
  details: [
    {
      label: "Sentinel-1 VV Backscatter",
      explanation:
        "SAR radar signal strength. Lower values (darker blue) indicate smoother surfaces like standing water. Values below -15 dB suggest potential flooding.",
    },
    {
      label: "Water Detection Mask",
      explanation:
        "Areas where radar backscatter falls below -15 dB threshold, indicating likely water presence. Blue pixels = detected water.",
    },
    {
      label: "Rainfall Accumulation (7 days)",
      explanation:
        "Total precipitation over the past 7 days from ERA5 reanalysis. Higher values indicate areas with heavy recent rainfall that may contribute to flooding.",
    },
  ],
  indicators: [
    { label: "High Flood Risk", condition: "VV Backscatter < -15 dB + Rainfall > 100mm" },
    { label: "Moderate Risk", condition: "VV Backscatter -15 to -12 dB + Rainfall > 50mm" },
    { label: "Low Risk", condition: "VV Backscatter > -12 dB + Rainfall < 50mm" },
  ],
};

const LANDSLIDE_INFO = {
  title: "Landslide Monitoring",
  description:
    "Monitoring landslide-prone terrain around Kuala Lumpur using elevation, slope, and rainfall data.",
  details: [
    {
      label: "DEM Elevation",
      explanation:
        "SRTM 30m elevation data. Hilly/mountainous terrain (red/white) at higher elevations is more susceptible to landslides, especially the Titiwangsa Range east of KL.",
    },
    {
      label: "Slope (degrees)",
      explanation:
        "Terrain steepness derived from DEM. Slopes above 25° (red/dark red) are high-risk for landslides. Green areas are relatively flat and stable.",
    },
    {
      label: "Recent Rainfall (7 days)",
      explanation:
        "Accumulated rainfall saturates soil on steep slopes, reducing stability. Combined with steep terrain, heavy rain is the primary landslide trigger in KL region.",
    },
  ],
  indicators: [
    { label: "High Landslide Risk", condition: "Slope > 25° + Rainfall > 100mm" },
    { label: "Moderate Risk", condition: "Slope 15-25° + Rainfall > 50mm" },
    { label: "Low Risk", condition: "Slope < 15° or Rainfall < 50mm" },
  ],
};

export default function DisasterMonitor() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"flood" | "landslide" | null>(null);

  async function fetchData(mode: "flood" | "landslide") {
    setLoading(true);
    setError(null);
    setActiveMode(mode);
    setLayers([]);

    try {
      const res = await fetch(`/api/gee/${mode}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLayers(data.layers);
    } catch (err: any) {
      setError(err.message || "Unknown error");
      setLayers([]);
    } finally {
      setLoading(false);
    }
  }

  const info = activeMode === "flood" ? FLOOD_INFO : activeMode === "landslide" ? LANDSLIDE_INFO : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-2">KL Disaster Monitor</h1>
      <p className="text-zinc-400 mb-8">
        Real-time satellite data for Kuala Lumpur (30 km radius)
      </p>

      <div className="flex gap-4 mb-8">
        <button
          onClick={() => fetchData("flood")}
          disabled={loading}
          className={`px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
            activeMode === "flood"
              ? "bg-blue-600 ring-2 ring-blue-400"
              : "bg-blue-700 hover:bg-blue-600"
          }`}
        >
          Flood Monitoring
        </button>
        <button
          onClick={() => fetchData("landslide")}
          disabled={loading}
          className={`px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
            activeMode === "landslide"
              ? "bg-orange-600 ring-2 ring-orange-400"
              : "bg-orange-700 hover:bg-orange-600"
          }`}
        >
          Landslide Monitoring
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-zinc-400 mb-8">
          <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
          <span>Loading Earth Engine data... this may take 10-30 seconds</span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-8">
          <p className="text-red-400">Error: {error}</p>
        </div>
      )}

      {/* Reference Map — shows KL area + ROI boundary */}
      {activeMode && !loading && layers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-3">
            {info?.title} — Coverage Area
          </h2>
          <div className="rounded-xl overflow-hidden border border-zinc-800" style={{ height: 400 }}>
            <MapSection />
          </div>
          <p className="text-zinc-500 text-sm mt-2">
            Blue rectangle shows the 30 km monitoring region around Kuala Lumpur (3.139°N, 101.687°E)
          </p>
        </div>
      )}

      {/* Heatmap layers */}
      {layers.length > 0 && (
        <>
          <h2 className="text-xl font-semibold mb-4">
            {info?.title} — Satellite Layers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {layers.map((layer, i) => (
              <div key={layer.name} className="bg-zinc-900 rounded-xl overflow-hidden">
                <img
                  src={layer.thumbnailUrl}
                  alt={layer.name}
                  className="w-full aspect-square object-cover"
                />
                <div className="p-4">
                  <h3 className="font-semibold mb-2">{layer.name}</h3>
                  {/* Layer explanation */}
                  {info && info.details[i] && (
                    <p className="text-xs text-zinc-500 mb-3">
                      {info.details[i].explanation}
                    </p>
                  )}
                  <div className="text-sm text-zinc-400 space-y-1">
                    <p className="text-zinc-300 font-medium mb-1">Raw Values (ROI mean):</p>
                    {Object.entries(layer.stats).map(([key, val]) => (
                      <p key={key}>
                        {key}: {val !== null ? Number(val).toFixed(4) : "No data"}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed information section */}
          {info && (
            <div className="bg-zinc-900 rounded-xl p-6 mb-8">
              <h2 className="text-xl font-semibold mb-3">Analysis Summary</h2>
              <p className="text-zinc-400 mb-4">{info.description}</p>

              <h3 className="text-md font-semibold mb-2 text-zinc-300">Risk Indicators</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {info.indicators.map((ind, i) => (
                  <div
                    key={ind.label}
                    className={`rounded-lg p-4 border ${
                      i === 0
                        ? "border-red-700 bg-red-900/20"
                        : i === 1
                        ? "border-yellow-700 bg-yellow-900/20"
                        : "border-green-700 bg-green-900/20"
                    }`}
                  >
                    <p
                      className={`font-semibold text-sm ${
                        i === 0 ? "text-red-400" : i === 1 ? "text-yellow-400" : "text-green-400"
                      }`}
                    >
                      {ind.label}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">{ind.condition}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-md font-semibold mb-2 text-zinc-300">Data Sources</h3>
              <div className="text-sm text-zinc-400 space-y-1">
                {activeMode === "flood" ? (
                  <>
                    <p>Sentinel-1 C-band SAR (COPERNICUS/S1_GRD) — 10m resolution, last 30 days composite</p>
                    <p>ERA5-Land Hourly Reanalysis (ECMWF/ERA5_LAND/HOURLY) — ~11km resolution, last 7 days</p>
                  </>
                ) : (
                  <>
                    <p>SRTM Digital Elevation Model (USGS/SRTMGL1_003) — 30m resolution</p>
                    <p>ERA5-Land Hourly Reanalysis (ECMWF/ERA5_LAND/HOURLY) — ~11km resolution, last 7 days</p>
                  </>
                )}
                <p className="text-zinc-600 mt-2">
                  Region: 30 km radius around Kuala Lumpur (3.139°N, 101.687°E)
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && layers.length === 0 && !error && (
        <div className="text-zinc-500 text-center py-20">
          <p className="text-lg">Select a monitoring mode above to load satellite data</p>
          <p className="text-sm mt-2">
            Data sources: Sentinel-1, SRTM DEM, ERA5 Rainfall
          </p>
        </div>
      )}
    </div>
  );
}
