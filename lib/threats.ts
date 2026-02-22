export type ThreatType = "flood" | "landslide";

export type Threat = {
  id: string;
  type: ThreatType;
  lat: number;
  lon: number;
  probability: number;
  updatedAt: string;
  drivers: {
    rainfall_6h_mm: number;
    slope: number;
    soil_wetness: number;
  };
};

export const threats: Threat[] = [
  { id: "KL-001", type: "flood", lat: 3.143, lon: 101.695, probability: 0.78, updatedAt: "2026-02-22T06:20:00Z", drivers: { rainfall_6h_mm: 84, slope: 0.16, soil_wetness: 0.8 } },
  { id: "KL-002", type: "landslide", lat: 3.178, lon: 101.721, probability: 0.62, updatedAt: "2026-02-22T06:22:00Z", drivers: { rainfall_6h_mm: 58, slope: 0.71, soil_wetness: 0.63 } },
  { id: "KL-003", type: "flood", lat: 3.131, lon: 101.672, probability: 0.29, updatedAt: "2026-02-22T06:25:00Z", drivers: { rainfall_6h_mm: 24, slope: 0.1, soil_wetness: 0.35 } },
  { id: "KL-004", type: "flood", lat: 3.157, lon: 101.737, probability: 0.83, updatedAt: "2026-02-22T06:30:00Z", drivers: { rainfall_6h_mm: 90, slope: 0.2, soil_wetness: 0.87 } },
  { id: "KL-005", type: "landslide", lat: 3.201, lon: 101.746, probability: 0.69, updatedAt: "2026-02-22T06:33:00Z", drivers: { rainfall_6h_mm: 67, slope: 0.8, soil_wetness: 0.74 } },
  { id: "KL-006", type: "flood", lat: 3.104, lon: 101.655, probability: 0.33, updatedAt: "2026-02-22T06:37:00Z", drivers: { rainfall_6h_mm: 32, slope: 0.09, soil_wetness: 0.41 } },
  { id: "KL-007", type: "landslide", lat: 3.223, lon: 101.731, probability: 0.54, updatedAt: "2026-02-22T06:40:00Z", drivers: { rainfall_6h_mm: 51, slope: 0.68, soil_wetness: 0.58 } },
  { id: "KL-008", type: "flood", lat: 3.126, lon: 101.754, probability: 0.71, updatedAt: "2026-02-22T06:45:00Z", drivers: { rainfall_6h_mm: 79, slope: 0.14, soil_wetness: 0.78 } },
  { id: "KL-009", type: "landslide", lat: 3.19, lon: 101.662, probability: 0.41, updatedAt: "2026-02-22T06:48:00Z", drivers: { rainfall_6h_mm: 46, slope: 0.6, soil_wetness: 0.5 } },
  { id: "KL-010", type: "flood", lat: 3.114, lon: 101.71, probability: 0.88, updatedAt: "2026-02-22T06:50:00Z", drivers: { rainfall_6h_mm: 97, slope: 0.11, soil_wetness: 0.9 } },
  { id: "KL-011", type: "landslide", lat: 3.169, lon: 101.776, probability: 0.58, updatedAt: "2026-02-22T06:53:00Z", drivers: { rainfall_6h_mm: 55, slope: 0.73, soil_wetness: 0.62 } },
  { id: "KL-012", type: "flood", lat: 3.078, lon: 101.69, probability: 0.24, updatedAt: "2026-02-22T06:56:00Z", drivers: { rainfall_6h_mm: 21, slope: 0.07, soil_wetness: 0.29 } },
  { id: "KL-013", type: "flood", lat: 3.147, lon: 101.632, probability: 0.47, updatedAt: "2026-02-22T07:00:00Z", drivers: { rainfall_6h_mm: 44, slope: 0.12, soil_wetness: 0.51 } },
  { id: "KL-014", type: "landslide", lat: 3.209, lon: 101.684, probability: 0.73, updatedAt: "2026-02-22T07:03:00Z", drivers: { rainfall_6h_mm: 74, slope: 0.82, soil_wetness: 0.79 } },
  { id: "KL-015", type: "flood", lat: 3.095, lon: 101.742, probability: 0.39, updatedAt: "2026-02-22T07:06:00Z", drivers: { rainfall_6h_mm: 40, slope: 0.13, soil_wetness: 0.45 } },
  { id: "KL-016", type: "landslide", lat: 3.239, lon: 101.705, probability: 0.67, updatedAt: "2026-02-22T07:08:00Z", drivers: { rainfall_6h_mm: 63, slope: 0.77, soil_wetness: 0.7 } },
  { id: "KL-017", type: "flood", lat: 3.116, lon: 101.622, probability: 0.31, updatedAt: "2026-02-22T07:12:00Z", drivers: { rainfall_6h_mm: 29, slope: 0.08, soil_wetness: 0.39 } },
  { id: "KL-018", type: "flood", lat: 3.163, lon: 101.704, probability: 0.65, updatedAt: "2026-02-22T07:16:00Z", drivers: { rainfall_6h_mm: 62, slope: 0.19, soil_wetness: 0.69 } },
  { id: "KL-019", type: "landslide", lat: 3.184, lon: 101.639, probability: 0.52, updatedAt: "2026-02-22T07:20:00Z", drivers: { rainfall_6h_mm: 49, slope: 0.66, soil_wetness: 0.57 } },
  { id: "KL-020", type: "flood", lat: 3.136, lon: 101.782, probability: 0.92, updatedAt: "2026-02-22T07:24:00Z", drivers: { rainfall_6h_mm: 104, slope: 0.18, soil_wetness: 0.94 } },
];

export function threatColor(probability: number) {
  if (probability < 0.35) return "green";
  if (probability <= 0.65) return "orange";
  return "red";
}
