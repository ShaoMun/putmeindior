import { Rectangle } from "cesium";

export const KL_LAT = 3.1480;
export const KL_LON = 101.7119;

/** Default camera height used both at load-in and when flying to a searched location */
export const DEFAULT_CAMERA_HEIGHT_METERS = 3_000;

/** Named areas restricted to West Malaysia only (lon 99.5–104.3, lat 0.8–7.5) */
export const WEST_MALAYSIA_LOCATIONS: { name: string; lat: number; lon: number }[] = [
  // Kuala Lumpur
  { name: "Kuala Lumpur",        lat: 3.1480,  lon: 101.7119 },
  { name: "Putrajaya",           lat: 2.9264,  lon: 101.6964 },
  { name: "Cyberjaya",           lat: 2.9213,  lon: 101.6559 },
  { name: "Petaling Jaya",       lat: 3.1073,  lon: 101.6067 },
  { name: "Shah Alam",           lat: 3.0738,  lon: 101.5183 },
  { name: "Subang Jaya",         lat: 3.0488,  lon: 101.5787 },
  { name: "Klang",               lat: 3.0449,  lon: 101.4456 },
  { name: "Rawang",              lat: 3.3268,  lon: 101.5756 },
  { name: "Gombak",              lat: 3.2210,  lon: 101.6998 },
  { name: "Ampang",              lat: 3.1468,  lon: 101.7621 },
  { name: "Cheras",              lat: 3.0864,  lon: 101.7482 },
  { name: "Kepong",              lat: 3.2108,  lon: 101.6363 },
  { name: "Setapak",             lat: 3.1935,  lon: 101.7160 },
  { name: "Wangsa Maju",         lat: 3.2007,  lon: 101.7334 },
  { name: "Desa Pandan",         lat: 3.1560,  lon: 101.7390 },
  { name: "Bukit Bintang",       lat: 3.1478,  lon: 101.7111 },
  { name: "KLCC",                lat: 3.1578,  lon: 101.7123 },
  // Selangor
  { name: "Sepang",              lat: 2.7282,  lon: 101.7025 },
  { name: "Nilai",               lat: 2.8126,  lon: 101.7948 },
  { name: "Semenyih",            lat: 2.9614,  lon: 101.8487 },
  { name: "Kajang",              lat: 2.9932,  lon: 101.7873 },
  { name: "Bangi",               lat: 2.9926,  lon: 101.7789 },
  { name: "Puchong",             lat: 3.0257,  lon: 101.6190 },
  { name: "Damansara",           lat: 3.1473,  lon: 101.6140 },
  { name: "Batu Caves",          lat: 3.2380,  lon: 101.6841 },
  { name: "Selayang",            lat: 3.2522,  lon: 101.6472 },
  { name: "Kuala Selangor",      lat: 3.3400,  lon: 101.2583 },
  { name: "Tanjung Karang",      lat: 3.4238,  lon: 101.0454 },
  { name: "Sabak Bernam",        lat: 3.7660,  lon: 100.9850 },
  { name: "Kuala Kubu Bharu",    lat: 3.5681,  lon: 101.6466 },
  { name: "Ulu Yam",             lat: 3.4651,  lon: 101.6537 },
  { name: "Semenyih",            lat: 2.9614,  lon: 101.8487 },
  { name: "Dengkil",             lat: 2.8551,  lon: 101.6783 },
  // Negeri Sembilan
  { name: "Seremban",            lat: 2.7260,  lon: 101.9381 },
  { name: "Port Dickson",        lat: 2.5213,  lon: 101.7953 },
  { name: "Rembau",              lat: 2.5963,  lon: 102.0933 },
  { name: "Tampin",              lat: 2.4688,  lon: 102.2280 },
  { name: "Kuala Pilah",         lat: 2.7390,  lon: 102.2490 },
  { name: "Bahau",               lat: 2.8075,  lon: 102.3991 },
  // Melaka
  { name: "Melaka",              lat: 2.1896,  lon: 102.2501 },
  { name: "Alor Gajah",         lat: 2.3818,  lon: 102.2082 },
  { name: "Jasin",               lat: 2.3060,  lon: 102.4321 },
  // Johor
  { name: "Johor Bahru",         lat: 1.4927,  lon: 103.7414 },
  { name: "Iskandar Puteri",     lat: 1.4748,  lon: 103.6289 },
  { name: "Batu Pahat",          lat: 1.8541,  lon: 102.9349 },
  { name: "Muar",                lat: 2.0442,  lon: 102.5689 },
  { name: "Kluang",              lat: 2.0249,  lon: 103.3183 },
  { name: "Segamat",             lat: 2.5117,  lon: 102.8195 },
  { name: "Kota Tinggi",         lat: 1.7347,  lon: 103.9036 },
  { name: "Mersing",             lat: 2.4351,  lon: 103.8396 },
  // Pahang (west-accessible parts)
  { name: "Temerloh",            lat: 3.4541,  lon: 102.4180 },
  { name: "Bentong",             lat: 3.5185,  lon: 101.9161 },
  { name: "Raub",                lat: 3.7908,  lon: 101.8621 },
  { name: "Kuala Lipis",         lat: 4.1846,  lon: 102.0533 },
  { name: "Mentakab",            lat: 3.5038,  lon: 102.3416 },
  { name: "Genting Highlands",   lat: 3.4228,  lon: 101.7934 },
  { name: "Cameron Highlands",   lat: 4.4694,  lon: 101.3779 },
  // Perak
  { name: "Ipoh",                lat: 4.5975,  lon: 101.0901 },
  { name: "Taiping",             lat: 4.8500,  lon: 100.7333 },
  { name: "Teluk Intan",         lat: 4.0238,  lon: 101.0225 },
  { name: "Lumut",               lat: 4.2330,  lon: 100.6291 },
  { name: "Sitiawan",            lat: 4.2185,  lon: 100.6983 },
  { name: "Batu Gajah",          lat: 4.4739,  lon: 101.0368 },
  { name: "Sungai Siput",        lat: 4.8283,  lon: 101.0733 },
  { name: "Kuala Kangsar",       lat: 4.7697,  lon: 100.9342 },
  { name: "Manjung",             lat: 4.2164,  lon: 100.7257 },
  // Penang
  { name: "Penang",              lat: 5.4141,  lon: 100.3288 },
  { name: "Georgetown",          lat: 5.4141,  lon: 100.3288 },
  { name: "Butterworth",         lat: 5.3992,  lon: 100.3643 },
  { name: "Bukit Mertajam",      lat: 5.3637,  lon: 100.4659 },
  { name: "Bayan Lepas",         lat: 5.2976,  lon: 100.2578 },
  // Kedah
  { name: "Alor Setar",          lat: 6.1248,  lon: 100.3673 },
  { name: "Sungai Petani",       lat: 5.6479,  lon: 100.4880 },
  { name: "Kulim",               lat: 5.3653,  lon: 100.5561 },
  { name: "Langkawi",            lat: 6.3502,  lon: 99.8162  },
  { name: "Jitra",               lat: 6.2694,  lon: 100.4239 },
  // Kelantan (west accessible)
  { name: "Kota Bharu",          lat: 6.1248,  lon: 102.2380 },
  { name: "Gua Musang",          lat: 4.8815,  lon: 101.9691 },
  { name: "Kuala Krai",          lat: 5.5338,  lon: 102.1996 },
  // Terengganu (coastal, reachable from west)
  { name: "Kuala Terengganu",    lat: 5.3302,  lon: 103.1408 },
  { name: "Dungun",              lat: 4.7603,  lon: 103.4188 },
  { name: "Kemaman",             lat: 4.2306,  lon: 103.4187 },
  // Perlis
  { name: "Kangar",              lat: 6.4414,  lon: 100.1986 },
];


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
