import TerrainCanvas from "@/components/scope/TerrainCanvas";

type SignalType = "ok" | "warn";

type PositionedSignal = {
  id: number;
  type: SignalType;
  top: string;
  left: string;
};

const markers: PositionedSignal[] = [
  { id: 1, type: "ok", top: "23%", left: "47%" },
  { id: 2, type: "warn", top: "27%", left: "65%" },
  { id: 3, type: "ok", top: "54%", left: "23%" },
  { id: 4, type: "warn", top: "56%", left: "56%" },
  { id: 5, type: "ok", top: "53%", left: "76%" },
];

const signalDots: PositionedSignal[] = [
  { id: 1, type: "ok", top: "16%", left: "18%" },
  { id: 2, type: "warn", top: "39%", left: "36%" },
  { id: 3, type: "ok", top: "31%", left: "71%" },
  { id: 4, type: "warn", top: "63%", left: "64%" },
  { id: 5, type: "ok", top: "69%", left: "84%" },
];

function Marker({
  type,
  top,
  left,
}: {
  type: SignalType;
  top: string;
  left: string;
}) {
  return (
    <span
      className={`scope-marker ${type}`}
      style={{ top, left }}
      aria-hidden="true"
    >
      {type === "ok" ? "✓" : "!"}
    </span>
  );
}

function SignalDot({
  type,
  top,
  left,
}: {
  type: SignalType;
  top: string;
  left: string;
}) {
  return (
    <span
      className={`signal-dot ${type}`}
      style={{ top, left }}
      aria-hidden="true"
    />
  );
}

export default function ScopeDashboard() {
  return (
    <main className="scope-page">
      <div className="scope-grid" aria-hidden="true" />
      <div className="scope-scan" aria-hidden="true" />

      <header className="scope-topbar">
        <div className="window-lights" aria-hidden="true">
          <span className="dot red" />
          <span className="dot amber" />
          <span className="dot green" />
        </div>
        <div className="scope-search">
          <span>Search</span>
          <div className="scope-thumb" aria-hidden="true" />
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
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            type={marker.type}
            top={marker.top}
            left={marker.left}
          />
        ))}

        <div
          className="scope-controls"
          role="toolbar"
          aria-label="Visualization controls"
        >
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
          <p className="threat-score">838</p>
          <p className="threat-label">Threat Activity</p>
          <button className="view-btn">View</button>
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
            <span style={{ height: "26%" }} />
            <span style={{ height: "62%" }} />
            <span style={{ height: "34%" }} />
            <span style={{ height: "18%" }} />
            <span style={{ height: "49%" }} />
            <span style={{ height: "28%" }} />
          </div>
        </section>

        <section className="hud-panel signal-panel">
          {signalDots.map((dot) => (
            <SignalDot
              key={dot.id}
              type={dot.type}
              top={dot.top}
              left={dot.left}
            />
          ))}
          <div className="unstable">Unstable connection ⚠</div>
        </section>

        <section className="hud-panel metrics-panel">
          <div>
            <p className="metric">1,250</p>
            <p className="metric-label">Stable Zones</p>
            <div className="metric-bars good" aria-hidden="true" />
          </div>
          <div>
            <p className="metric">672</p>
            <p className="metric-label">Critical Zones</p>
            <div className="metric-bars bad" aria-hidden="true" />
          </div>
        </section>
      </footer>
    </main>
  );
}
