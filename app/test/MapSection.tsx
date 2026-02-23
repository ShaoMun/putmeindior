"use client";

import { MapContainer, TileLayer, Rectangle, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// KL center
const KL_LAT = 3.139;
const KL_LON = 101.6869;

// Approximate 30km ROI bounding box
const ROI_BOUNDS: L.LatLngBoundsExpression = [
  [2.87, 101.42], // SW corner
  [3.41, 101.95], // NE corner
];

// Fix default marker icon (Leaflet + webpack issue)
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export default function MapSection() {
  return (
    <MapContainer
      center={[KL_LAT, KL_LON]}
      zoom={10}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {/* ROI boundary rectangle */}
      <Rectangle
        bounds={ROI_BOUNDS}
        pathOptions={{
          color: "#3b82f6",
          weight: 3,
          fillColor: "#3b82f6",
          fillOpacity: 0.08,
          dashArray: "8 4",
        }}
      />
      {/* KL center marker */}
      <Marker position={[KL_LAT, KL_LON]} icon={markerIcon}>
        <Popup>
          <strong>Kuala Lumpur</strong>
          <br />
          3.139°N, 101.687°E
          <br />
          Monitoring center
        </Popup>
      </Marker>
    </MapContainer>
  );
}
