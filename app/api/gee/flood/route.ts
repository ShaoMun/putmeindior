import { NextResponse } from "next/server";
import { getEE, eeEval, eeThumbUrl, KL_LON, KL_LAT } from "@/app/lib/ee-init";

export const maxDuration = 60;

export async function GET() {
  try {
    const ee = await getEE();

    // Region of interest: ~30 km buffer around KL
    const KL_POINT = ee.Geometry.Point([KL_LON, KL_LAT]);
    const ROI = KL_POINT.buffer(30000).bounds();

    // Date ranges
    const now = ee.Date(Date.now());
    const start30 = now.advance(-30, "day");
    const start7 = now.advance(-7, "day");
    const WATER_THRESHOLD = -15;

    // A) Sentinel-1 VV backscatter composite (last 30 days)
    const s1 = ee
      .ImageCollection("COPERNICUS/S1_GRD")
      .filterBounds(ROI)
      .filterDate(start30, now)
      .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
      .filter(ee.Filter.eq("instrumentMode", "IW"))
      .select("VV");
    const s1Composite = s1.mean().clip(ROI);

    // B) Water detection mask (VV < threshold)
    const waterMask = s1Composite.lt(WATER_THRESHOLD);

    // C) ERA5 rainfall accumulation (last 7 days — ERA5 has ~5 day lag)
    const era5 = ee
      .ImageCollection("ECMWF/ERA5_LAND/HOURLY")
      .filterBounds(ROI)
      .filterDate(start7, now)
      .select("total_precipitation");
    const rainfall24h = era5.sum().multiply(1000).clip(ROI);

    // Generate thumbnails + stats in parallel
    const [s1Thumb, waterThumb, rainThumb, s1Stats, waterStats, rainStats] =
      await Promise.all([
        eeThumbUrl(s1Composite, {
          dimensions: 512,
          region: ROI,
          min: -25,
          max: 0,
          palette: ["000080", "0000ff", "00ffff", "ffff00", "ff0000"],
          format: "png",
        }),
        eeThumbUrl(waterMask.selfMask(), {
          dimensions: 512,
          region: ROI,
          palette: ["0000ff"],
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
          s1Composite.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: ROI,
            scale: 100,
            maxPixels: 1e9,
          })
        ),
        eeEval(
          waterMask.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: ROI,
            scale: 100,
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
          name: "Sentinel-1 VV Backscatter (dB)",
          thumbnailUrl: s1Thumb,
          stats: s1Stats,
        },
        {
          name: "Water Detection Mask",
          thumbnailUrl: waterThumb,
          stats: waterStats,
        },
        {
          name: "Rainfall Accumulation 7d (mm)",
          thumbnailUrl: rainThumb,
          stats: rainStats,
        },
      ],
    });
  } catch (error: any) {
    console.error("GEE Flood error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch flood data" },
      { status: 500 }
    );
  }
}
