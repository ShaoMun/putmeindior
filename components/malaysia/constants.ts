import { Rectangle } from "cesium";

export const KL_LAT = 3.1480;
export const KL_LON = 101.7119;

export const MALAYSIA_BOUNDS = {
  west: 99.5,
  east: 109.4,
  south: 0.8,
  north: 7.5,
};

export const MIN_CAMERA_HEIGHT_METERS = 120;
export const MAX_CAMERA_HEIGHT_METERS = 1_250_000;
export const FAR_RECENTER_HEIGHT_METERS = 900_000;

export const MALAYSIA_CENTER_LON =
  (MALAYSIA_BOUNDS.west + MALAYSIA_BOUNDS.east) * 0.5;
export const MALAYSIA_CENTER_LAT =
  (MALAYSIA_BOUNDS.south + MALAYSIA_BOUNDS.north) * 0.5;

export const WEST_MALAYSIA_IMAGERY_RECTANGLE = Rectangle.fromDegrees(
  99.5, 0.8, 104.3, 7.5,
);
export const SOUTH_CHINA_SEA_IMAGERY_RECTANGLE = Rectangle.fromDegrees(
  104.3, 1.4, 109.4, 7.2,
);
export const LAND_IMAGERY_RECTANGLES = [WEST_MALAYSIA_IMAGERY_RECTANGLE];

export const BLACK_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5l9VUAAAAASUVORK5CYII=";
export const OCEAN_TILE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%23080a0c'/%3E%3C/svg%3E";
