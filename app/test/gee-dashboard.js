// ============================================================
// Disaster Monitoring Dashboard — Kuala Lumpur
// Google Earth Engine JavaScript API
// Paste this entire script into: https://code.earthengine.google.com
// ============================================================

// ---------------------
// 1. CONFIGURATION
// ---------------------

// Kuala Lumpur center coordinates
var KL_LON = 101.6869;
var KL_LAT = 3.1390;
var KL_POINT = ee.Geometry.Point([KL_LON, KL_LAT]);

// Region of interest: ~30 km buffer around KL
var ROI = KL_POINT.buffer(30000).bounds();

// Date range: last 30 days for satellite data, last 1 day for rainfall
var now = ee.Date(Date.now());
var start30 = now.advance(-30, 'day');
var start1 = now.advance(-1, 'day');

// Water detection threshold for Sentinel-1 VV band (dB)
var WATER_THRESHOLD = -15;

// ---------------------
// 2. UI SETUP
// ---------------------

// Clear default UI
ui.root.clear();

// Create map widget with satellite basemap
var mapPanel = ui.Map();
mapPanel.setOptions('SATELLITE');
mapPanel.setCenter(KL_LON, KL_LAT, 11);

// Create side panel for info display
var sidePanel = ui.Panel({
  style: {
    width: '350px',
    padding: '15px',
    backgroundColor: '#ffffff'
  }
});

// Title label
var titleLabel = ui.Label('KL Disaster Monitor', {
  fontSize: '22px',
  fontWeight: 'bold',
  color: '#000000',
  margin: '0 0 15px 0'
});
sidePanel.add(titleLabel);

// Subtitle
var subtitleLabel = ui.Label('Select a monitoring mode below:', {
  fontSize: '13px',
  color: '#000000',
  margin: '0 0 20px 0'
});
sidePanel.add(subtitleLabel);

// Flood Monitoring button
var floodButton = ui.Button({
  label: '🌊 Flood Monitoring',
  style: {
    stretch: 'horizontal',
    backgroundColor: '#0077b6',
    color: 'white',
    fontSize: '14px',
    fontWeight: 'bold',
    padding: '10px',
    margin: '0 0 10px 0'
  },
  onClick: loadFloodMonitoring
});
sidePanel.add(floodButton);

// Landslide Monitoring button
var landslideButton = ui.Button({
  label: '⛰️ Landslide Monitoring',
  style: {
    stretch: 'horizontal',
    backgroundColor: '#e76f51',
    color: 'white',
    fontSize: '14px',
    fontWeight: 'bold',
    padding: '10px',
    margin: '0 0 20px 0'
  },
  onClick: loadLandslideMonitoring
});
sidePanel.add(landslideButton);

// Separator
sidePanel.add(ui.Label('─────────────────────────', {color: '#000000'}));

// Info panel (will be populated by button clicks)
var infoPanel = ui.Panel({style: {margin: '10px 0 0 0'}});
sidePanel.add(infoPanel);

// Lay out the UI: side panel + map
var mainPanel = ui.SplitPanel({
  firstPanel: sidePanel,
  secondPanel: mapPanel
});
ui.root.add(mainPanel);

// ---------------------
// 3. HELPER FUNCTIONS
// ---------------------

// Clear all layers and info text
function clearAll() {
  mapPanel.layers().reset();
  infoPanel.clear();
}

// Add a styled info label to the side panel
function addInfo(text, opts) {
  var defaults = {fontSize: '12px', color: '#000000', margin: '4px 0'};
  var style = opts || defaults;
  infoPanel.add(ui.Label(text, style));
}

// Add a section heading
function addHeading(text) {
  addInfo(text, {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#000000',
    margin: '12px 0 4px 0'
  });
}

// Compute and display mean value of an image in the ROI
function showMeanValue(image, label, region, scale) {
  var mean = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: region,
    scale: scale || 1000,
    maxPixels: 1e9
  });
  mean.evaluate(function(result) {
    if (result) {
      var keys = Object.keys(result);
      for (var i = 0; i < keys.length; i++) {
        var val = result[keys[i]];
        var displayVal = (val !== null && val !== undefined)
          ? val.toFixed(4)
          : 'No data';
        addInfo('  ' + label + ' [' + keys[i] + ']: ' + displayVal);
      }
    } else {
      addInfo('  ' + label + ': No data available');
    }
  });
}

// ---------------------
// 4. FLOOD MONITORING
// ---------------------

function loadFloodMonitoring() {
  clearAll();
  mapPanel.setCenter(KL_LON, KL_LAT, 11);

  addHeading('🌊 FLOOD MONITORING');
  addInfo('Region: Kuala Lumpur (~30 km radius)');
  addInfo('Data window: last 30 days');
  addInfo('Loading layers...');

  // --- A) Sentinel-1 radar backscatter ---
  // Filter Sentinel-1 GRD for VV polarization, IW mode, descending orbit
  var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(ROI)
    .filterDate(start30, now)
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .select('VV');

  // Composite: take the mean of all scenes in the time window
  var s1Composite = s1.mean().clip(ROI);

  // Add Sentinel-1 VV backscatter layer
  mapPanel.addLayer(s1Composite, {
    min: -25,
    max: 0,
    palette: ['000080', '0000ff', '00ffff', 'ffff00', 'ff0000']
  }, 'Sentinel-1 VV Backscatter (dB)');

  // --- B) Water detection mask ---
  // Pixels below the threshold are classified as water
  var waterMask = s1Composite.lt(WATER_THRESHOLD);

  mapPanel.addLayer(waterMask.selfMask(), {
    palette: ['0000ff'],
    opacity: 0.6
  }, 'Water Detection Mask (VV < ' + WATER_THRESHOLD + ' dB)');

  // --- C) ERA5 rainfall accumulation (last 24h) ---
  // total_precipitation is in meters per hour; sum over 24h
  var era5 = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
    .filterBounds(ROI)
    .filterDate(start1, now)
    .select('total_precipitation_sum');

  var rainfall24h = era5.sum().multiply(1000).clip(ROI); // convert m to mm

  mapPanel.addLayer(rainfall24h, {
    min: 0,
    max: 50,
    palette: ['white', 'lightblue', 'blue', 'darkblue', 'purple']
  }, 'Rainfall Accumulation 24h (mm)');

  // --- D) Display raw values ---
  addHeading('Raw Values (ROI mean)');
  showMeanValue(s1Composite, 'S1 VV Backscatter (dB)', ROI, 100);
  showMeanValue(waterMask, 'Water Mask (fraction)', ROI, 100);
  showMeanValue(rainfall24h, 'Rainfall 24h (mm)', ROI, 11000);

  addInfo('');
  addInfo('Layers loaded.', {
    fontSize: '12px',
    color: '#000000',
    margin: '10px 0'
  });
}

// ---------------------
// 5. LANDSLIDE MONITORING
// ---------------------

function loadLandslideMonitoring() {
  clearAll();
  mapPanel.setCenter(KL_LON, KL_LAT, 11);

  addHeading('⛰️ LANDSLIDE MONITORING');
  addInfo('Region: Kuala Lumpur (~30 km radius)');
  addInfo('Loading layers...');

  // --- A) SRTM DEM elevation ---
  var dem = ee.Image('USGS/SRTMGL1_003').clip(ROI);

  mapPanel.addLayer(dem, {
    min: 0,
    max: 500,
    palette: ['006600', '33cc33', 'ffff00', 'ff9900', 'ff0000', 'ffffff']
  }, 'DEM Elevation (m)');

  // --- B) Slope derived from DEM ---
  var slope = ee.Terrain.slope(dem);

  mapPanel.addLayer(slope, {
    min: 0,
    max: 45,
    palette: ['00ff00', 'ffff00', 'ff8800', 'ff0000', '8b0000']
  }, 'Slope (degrees)');

  // --- C) Recent rainfall accumulation ---
  var era5 = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
    .filterBounds(ROI)
    .filterDate(start1, now)
    .select('total_precipitation_sum');

  var rainfall24h = era5.sum().multiply(1000).clip(ROI); // mm

  mapPanel.addLayer(rainfall24h, {
    min: 0,
    max: 50,
    palette: ['white', 'lightblue', 'blue', 'darkblue', 'purple']
  }, 'Recent Rainfall (mm)');

  // --- D) Display raw values ---
  addHeading('Raw Values (ROI mean)');
  showMeanValue(dem.select('elevation'), 'Elevation (m)', ROI, 30);
  showMeanValue(slope, 'Slope (degrees)', ROI, 30);
  showMeanValue(rainfall24h, 'Rainfall 24h (mm)', ROI, 11000);

  addInfo('');
  addInfo('Layers loaded.', {
    fontSize: '12px',
    color: '#000000',
    margin: '10px 0'
  });
}

// ---------------------
// 6. DEFAULT VIEW
// ---------------------

// Show a welcome message on first load
addHeading('Welcome');
addInfo('Click a monitoring button above to load');
addInfo('satellite data for Kuala Lumpur.');
addInfo('');
addInfo('Data sources:', {fontSize: '12px', color: '#000000', margin: '8px 0 2px 0'});
addInfo('• Sentinel-1 SAR (COPERNICUS/S1_GRD)');
addInfo('• SRTM DEM (USGS/SRTMGL1_003)');
addInfo('• ERA5 Rainfall (ECMWF/ERA5_LAND/HOURLY)');
