// Single source of truth for versions, URLs and constants.

export const APP_VERSION = "5.0.0";
export const FORMAT_VERSION = "5.0";          // region-set file format written by this app

export const STORAGE_KEY = "density_explorer_region_set_v5";
export const LEGACY_STORAGE_KEYS = ["la_hidden_density_editor_v32", "la_hidden_density_editor_v31"];

export const DEFAULT_REGION_SET_URL = "data/regions/la_core.json";
export const LEGACY_WORKBOOK_URL = "data/regions/legacy_workbook_v32.json";
export const STATS_URL = "data/tracts/stats_2020.json";
export const AREAS_URL = "data/areas.json";
export const TRACT_INDEX_URL = "data/tracts/index.json";
export const TRACT_DATA_BASE = "data/tracts/";   // index.json file paths are relative to this
export const AREA_STORAGE_KEY = "density_explorer_area";
export const TRANSIT_INDEX_URL = "data/transit/index.json";
export const TRANSIT_DATA_BASE = "data/transit/";
export const TRANSIT_STORAGE_KEY = "density_explorer_transit_v1";
export const VIEWPORT_LOAD_MIN_ZOOM = 10;        // pan/zoom below this never triggers county downloads

export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";
export const DEFAULT_VIEW = { center: [34.02, -118.15], zoom: 9 };

export const PALETTE = [
  "#2b6cb0", "#dd6b20", "#2f855a", "#c53030", "#805ad5", "#975a16", "#d53f8c", "#4a5568",
  "#718096", "#0f9aa8", "#6b8e23", "#b7791f", "#319795", "#b83280", "#2c7a7b", "#744210",
  "#4c51bf", "#c05621", "#276749", "#702459",
];

export const HISTORY_LIMIT = 100;
