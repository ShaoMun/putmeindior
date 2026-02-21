"use client";

import { useMemo, useState } from "react";
import SimulationOverlay from "@/components/scope/SimulationOverlay";
import TerrainCanvas from "@/components/scope/TerrainCanvas";
import { createSimulationData, type GpsMode } from "@/components/scope/simulation";
import { useDeviceLocation } from "@/components/scope/useDeviceLocation";

type SignalType = "ok" | "warn";

type PositionedSignal = {
  id: number;
  type: SignalType;
  top: string;
  left: string;
};

function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function toFixedPercent(value: number): string {
  return `${Math.round(value * 1000) / 1000}%`;
}

export default function ScopeDashboard() {
  const [gpsMode, setGpsMode] = useState<GpsMode>("demo");

  const { location, status, errorMessage, resetLiveState } = useDeviceLocation(gpsMode);

  const simulation = useMemo(
    () => createSimulationData(location, gpsMode),
    [gpsMode, location],
  );

  const markers: PositionedSignal[] = simulation.survivorZones.slice(0, 5).map((zone, index) => ({
    id: index + 1,
    type: zone.probability > 0.63 ? "ok" : "warn",
    top: toFixedPercent(zone.y),
    left: toFixedPercent(zone.x),
  }));

  const signalDots: PositionedSignal[] = simulation.riskZones.slice(0, 5).map((zone, index) => ({
    id: index + 1,
    type: zone.risk > 0.62 ? "warn" : "ok",
    top: toFixedPercent(zone.y),
    left: toFixedPercent(zone.x),
  }));

  return (
    <main className="scope-page">
      <div className="outside-noise" aria-hidden="true" />

      <section className="scope-shell">
        <div className="axis-top" aria-hidden="true">
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>D</span>
          <span>E</span>
          <span>F</span>
        </div>
        <div className="axis-left" aria-hidden="true">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5</span>
        </div>
        <div className="axis-right" aria-hidden="true">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5</span>
        </div>

        <div className="scope-grid" aria-hidden="true" />
        <div className="scope-scan" aria-hidden="true" />
        <div className="hatch hatch-a" aria-hidden="true" />
        <div className="hatch hatch-b" aria-hidden="true" />

        <header className="scope-topbar">
          <div className="window-lights" aria-hidden="true">
            <span className="dot red" />
            <span className="dot amber" />
            <span className="dot green" />
          </div>

          <div className="topbar-actions">
            <div className="gps-toggle" role="tablist" aria-label="GPS mode">
              <button
                type="button"
                className={gpsMode === "demo" ? "active" : ""}
                onClick={() => setGpsMode("demo")}
              >
                Demo
              </button>
              <button
                type="button"
                className={gpsMode === "live" ? "active" : ""}
                onClick={() => {
                  resetLiveState();
                  setGpsMode("live");
                }}
              >
                Live GPS
              </button>
            </div>
            <div className="scope-search">
              <span>search</span>
              <div className="scope-thumb" aria-hidden="true" />
            </div>
          </div>
        </header>

        <aside className="scope-sidebar">
          <button className="scope-home" aria-label="Home">
            ↗
          </button>
          <h1>[SCOPE]</h1>
          <nav>
            <a href="#">REGION</a>
            <a href="#">TIME</a>
            <a href="#">CONNECTIONS</a>
            <a href="#">SURFACE VIEW</a>
          </nav>
        </aside>

        <section className="terrain-stage" aria-label="Terrain monitor">
          <TerrainCanvas />
          <SimulationOverlay
            centerX={simulation.centerX}
            centerY={simulation.centerY}
            survivorZones={simulation.survivorZones}
            riskZones={simulation.riskZones}
          />

          {markers.map((marker) => (
            <span
              key={marker.id}
              className={`scope-marker ${marker.type}`}
              style={{ top: marker.top, left: marker.left }}
              aria-hidden="true"
            >
              {marker.type === "ok" ? "✓" : "!"}
            </span>
          ))}

          <div className="scope-controls" role="toolbar" aria-label="Visualization controls">
            <button className="active" aria-label="Signal graph">
              ∿
            </button>
            <button aria-label="Target mode">◎</button>
            <button aria-label="Center mode">✛</button>
            <button aria-label="Info mode">ⓘ</button>
            <button aria-label="Security mode">⌂</button>
          </div>
        </section>

        <aside className="threat-panel">
          <div className="threat-top">
            <p className="threat-score">
              {simulation.threatActivity}
              <span>/2.4k</span>
            </p>
            <p className="threat-label">Threat Activity</p>
            <div className="gps-readout">
              <span className={`gps-pill ${status}`}>{status}</span>
              <span>
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </span>
              <span>±{Math.round(location.accuracy)}m</span>
            </div>
            {errorMessage ? <p className="gps-error">{errorMessage}</p> : null}
            <button className="view-btn">View →</button>
          </div>
          <div className="threat-stats">
            <span>Aftershock: {toPercent(simulation.aftershockRisk)}</span>
            <span>Collapse Trend: {toPercent(simulation.collapseTrend)}</span>
          </div>
          <div className="ring" aria-hidden="true" />
          <div className="globe" aria-hidden="true">
            <span className="meridian" />
            <span className="parallel p1" />
            <span className="parallel p2" />
            <span className="parallel p3" />
            <span className="vertical v1" />
            <span className="vertical v2" />
            <span className="vertical v3" />
          </div>
        </aside>

        <footer className="hud-row">
          <section className="hud-panel chart-panel">
            <div className="hud-selects">
              <span>Terrain shift</span>
              <span>12hr activity</span>
            </div>
            <p>Surface Activity Breakdown</p>
            <div className="bars" aria-hidden="true">
              {simulation.activityBars.map((bar, index) => (
                <span key={`bar-${index}`} style={{ height: `${bar}%` }} />
              ))}
            </div>
          </section>

          <section className="hud-panel signal-panel">
            {signalDots.map((dot) => (
              <span
                key={dot.id}
                className={`signal-dot ${dot.type}`}
                style={{ top: dot.top, left: dot.left }}
                aria-hidden="true"
              />
            ))}
            <div className="unstable">Unstable connection ⚠</div>
          </section>

          <section className="hud-panel metrics-panel">
            <div>
              <p className="metric">
                {simulation.stableZones.toLocaleString()}
                <span>/3.5k</span>
              </p>
              <p className="metric-label">Stable Zones</p>
              <div className="metric-bars good" aria-hidden="true" />
            </div>
            <div>
              <p className="metric">
                {simulation.criticalZones.toLocaleString()}
                <span>/1.8k</span>
              </p>
              <p className="metric-label">Critical Zones</p>
              <div className="metric-bars bad" aria-hidden="true" />
            </div>
          </section>
        </footer>
      </section>
    </main>
  );
}
