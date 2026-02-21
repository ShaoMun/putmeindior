export type GpsMode = "demo" | "live";

export type DeviceLocation = {
  lat: number;
  lng: number;
  accuracy: number;
};

export type SurvivorZone = {
  id: string;
  x: number;
  y: number;
  probability: number;
};

export type RiskZone = {
  id: string;
  x: number;
  y: number;
  risk: number;
};

export type SimulationData = {
  centerX: number;
  centerY: number;
  survivorZones: SurvivorZone[];
  riskZones: RiskZone[];
  aftershockRisk: number;
  collapseTrend: number;
  threatActivity: number;
  stableZones: number;
  criticalZones: number;
  activityBars: number[];
};

const DEMO_ANCHOR = {
  lat: 3.139,
  lng: 101.6869,
};

function hashSeed(lat: number, lng: number): number {
  const seed = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
  return seed - Math.floor(seed);
}

function seededRandom(seed: number, index: number): number {
  const value = Math.sin((seed + index * 0.137) * 12345.6789) * 23456.789;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createSimulationData(
  location: DeviceLocation,
  mode: GpsMode,
): SimulationData {
  const seed = hashSeed(location.lat, location.lng);
  const metersPerDegLat = 111_320;
  const metersPerDegLng =
    111_320 * Math.cos((DEMO_ANCHOR.lat * Math.PI) / 180);
  const deltaMetersX = (location.lng - DEMO_ANCHOR.lng) * metersPerDegLng;
  const deltaMetersY = (location.lat - DEMO_ANCHOR.lat) * metersPerDegLat;
  const normalizedX = clamp(deltaMetersX / 200, -1, 1);
  const normalizedY = clamp(deltaMetersY / 200, -1, 1);

  const centerX = 50 + normalizedX * 16;
  const centerY = 56 - normalizedY * 14;

  const survivorZones: SurvivorZone[] = Array.from({ length: 6 }).map((_, index) => {
    const angle = seededRandom(seed, 20 + index) * Math.PI * 2;
    const radius = 12 + seededRandom(seed, 35 + index) * 25;
    const x = clamp(centerX + Math.cos(angle) * radius, 8, 92);
    const y = clamp(centerY + Math.sin(angle) * radius * 0.64, 14, 88);
    const probability = clamp(0.38 + seededRandom(seed, 50 + index) * 0.53, 0, 1);

    return {
      id: `survivor-${index}`,
      x,
      y,
      probability,
    };
  });

  const riskZones: RiskZone[] = Array.from({ length: 7 }).map((_, index) => {
    const angle = seededRandom(seed, 80 + index) * Math.PI * 2;
    const radius = 16 + seededRandom(seed, 95 + index) * 30;
    const x = clamp(centerX + Math.cos(angle) * radius, 6, 94);
    const y = clamp(centerY + Math.sin(angle) * radius * 0.7, 12, 90);
    const risk = clamp(0.42 + seededRandom(seed, 110 + index) * 0.48, 0, 1);

    return {
      id: `risk-${index}`,
      x,
      y,
      risk,
    };
  });

  const aftershockRisk = clamp(0.28 + seededRandom(seed, 130) * 0.46, 0, 1);
  const collapseTrend = clamp(0.22 + seededRandom(seed, 131) * 0.62, 0, 1);

  const threatActivity = Math.round(760 + seededRandom(seed, 145) * 290 + aftershockRisk * 110);
  const stableZones = Math.round(980 + seededRandom(seed, 152) * 520);
  const criticalZones = Math.round(480 + seededRandom(seed, 153) * 320 + collapseTrend * 180);

  const activityBars = Array.from({ length: 12 }).map((_, index) => {
    const base = 10 + seededRandom(seed, 180 + index) * 66;
    return Math.round(base + Math.sin(index * 0.8 + seed * 4) * 10);
  });

  if (mode === "live") {
    return {
      centerX,
      centerY,
      survivorZones,
      riskZones,
      aftershockRisk,
      collapseTrend,
      threatActivity,
      stableZones,
      criticalZones,
      activityBars,
    };
  }

  return {
    centerX: 50,
    centerY: 56,
    survivorZones,
    riskZones,
    aftershockRisk,
    collapseTrend,
    threatActivity,
    stableZones,
    criticalZones,
    activityBars,
  };
}
