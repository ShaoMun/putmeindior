import { NextResponse } from "next/server";
import { getEE, eeEval, eeThumbUrl, KL_LON, KL_LAT } from "@/app/lib/ee-init";

export const maxDuration = 60;

export async function GET() {
  try {
    const ee = await getEE();

    // Region of interest: ~30 km buffer around KL
    const KL_POINT = ee.Geometry.Point([KL_LON, KL_LAT]);
    const ROI = KL_POINT.buffer(30000).bounds();

    // Date range for rainfall
    const now = ee.Date(Date.now());
    const start7 = now.advance(-7, "day");

    // A) SRTM DEM elevation
    const dem = ee.Image("USGS/SRTMGL1_003").clip(ROI);

    // B) Slope derived from DEM
    const slope = ee.Terrain.slope(dem);

    // C) ERA5 rainfall accumulation (last 7 days — ERA5 has ~5 day lag)
    const era5 = ee
      .ImageCollection("ECMWF/ERA5_LAND/HOURLY")
      .filterBounds(ROI)
      .filterDate(start7, now)
      .select("total_precipitation");
    const rainfall24h = era5.sum().multiply(1000).clip(ROI);

    // Generate thumbnails + stats in parallel
    const [demThumb, slopeThumb, rainThumb, demStats, slopeStats, rainStats] =
      await Promise.all([
        eeThumbUrl(dem, {
          dimensions: 512,
          region: ROI,
          min: 0,
          max: 500,
          palette: ["006600", "33cc33", "ffff00", "ff9900", "ff0000", "ffffff"],
          format: "png",
        }),
        eeThumbUrl(slope, {
          dimensions: 512,
          region: ROI,
          min: 0,
          max: 45,
          palette: ["00ff00", "ffff00", "ff8800", "ff0000", "8b0000"],
          format: "png",
        }),
        eeThumbUrl(rainfall24h, {
          dimensions: 512,
          region: ROI,
          min: 0,
          max: 50,
          palette: ["ffffff", "add8e6", "0000ff", "00008b", "800080"],
          format: "png",
        }),
        eeEval(
          dem.select("elevation").reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: ROI,
            scale: 30,
            maxPixels: 1e9,
          })
        ),
        eeEval(
          slope.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: ROI,
            scale: 30,
            maxPixels: 1e9,
          })
        ),
        eeEval(
          rainfall24h.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: ROI,
            scale: 11000,
            maxPixels: 1e9,
          })
        ),
      ]);

    return NextResponse.json({
      layers: [
        {
          name: "DEM Elevation (m)",
          thumbnailUrl: demThumb,
          stats: demStats,
        },
        {
          name: "Slope (degrees)",
          thumbnailUrl: slopeThumb,
          stats: slopeStats,
        },
        {
          name: "Recent Rainfall 7d (mm)",
          thumbnailUrl: rainThumb,
          stats: rainStats,
        },
      ],
    });
  } catch (error: any) {
    console.error("GEE Landslide error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch landslide data" },
      { status: 500 }
    );
  }
}
