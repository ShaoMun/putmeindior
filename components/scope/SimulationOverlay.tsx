import type { RiskZone, SurvivorZone } from "@/components/scope/simulation";

type SimulationOverlayProps = {
  centerX: number;
  centerY: number;
  survivorZones: SurvivorZone[];
  riskZones: RiskZone[];
};

function quantize(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toPercent(value: number): string {
  return `${quantize(value)}%`;
}

export default function SimulationOverlay({
  centerX,
  centerY,
  survivorZones,
  riskZones,
}: SimulationOverlayProps) {
  return (
    <div className="sim-overlay" aria-hidden="true">
      <div className="sim-radius-ring" style={{ left: toPercent(centerX), top: toPercent(centerY) }}>
        <span>200m radius</span>
      </div>
      <div className="sim-center" style={{ left: toPercent(centerX), top: toPercent(centerY) }} />

      {survivorZones.map((zone) => (
        <div
          key={zone.id}
          className="sim-survivor-zone"
          style={{
            left: toPercent(zone.x),
            top: toPercent(zone.y),
            opacity: quantize(0.28 + zone.probability * 0.42),
            transform: `translate(-50%, -50%) scale(${quantize(0.74 + zone.probability * 0.65)})`,
          }}
        />
      ))}

      {riskZones.map((zone) => (
        <div
          key={zone.id}
          className="sim-risk-zone"
          style={{
            left: toPercent(zone.x),
            top: toPercent(zone.y),
            opacity: quantize(0.45 + zone.risk * 0.5),
          }}
        />
      ))}
    </div>
  );
}
