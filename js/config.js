// Single source of truth for versions, URLs and constants.

export const APP_VERSION = "0.1.0";
export const FORMAT_VERSION = "6.0";          // region-set file format written by this app

export const STORAGE_KEY = "ogna_map_region_set_v6";
export const METRIC_STORAGE_KEY = "ogna_map_metric";

// Data files live under data/ by default; ?data=test/fixture/ points the app at another folder.
const params = new URLSearchParams(globalThis.location?.search || "");
export const DATA_BASE = (params.get("data") || "data/").replace(/\/?$/, "/");
export const PARCELS_URL = DATA_BASE + "parcels.json";
export const BLOCKS_URL = DATA_BASE + "blocks.json";
export const CITY_URL = DATA_BASE + "city_limits.json";
export const DEFAULT_REGION_SET_URL = "data/regions/oldtown.json";

export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";
export const DEFAULT_VIEW = { center: [37.0065, -121.5705], zoom: 15 };

export const PALETTE = [
  "#2b6cb0", "#dd6b20", "#2f855a", "#c53030", "#805ad5", "#975a16", "#d53f8c", "#0f9aa8",
  "#6b8e23", "#b7791f", "#319795", "#b83280", "#4c51bf", "#c05621", "#276749", "#702459",
];
export const DISTRICT_COLOR = "#1a202c";

export const HISTORY_LIMIT = 100;

// Neighborhood organizing stages, in order.
export const STATUSES = ["idea", "forming", "active", "dormant"];

/**
 * Property tax estimate used until a tax roll is imported: net assessed value × this rate. California's
 * base rate is 1%; voter-approved school, college and water district bonds bring most Gilroy tax rate areas
 * to roughly 1.1–1.25%. Special assessments and fixed charges are not included. Adjust after the import.
 */
export const EST_TAX_RATE = 0.0118;

/**
 * Housing units assumed per lot when the parcel layer has no unit count, by land-use class. Block
 * population is spread over a block's residential lots in proportion to these. "area" classes get units
 * from lot size (one per `sqftPerUnit`, at least `min`).
 */
export const UNIT_WEIGHTS = {
  single: 1, condo: 1, mobile: 1, duplex: 2, triplex: 3, fourplex: 4,
  multi: { area: true, sqftPerUnit: 1100, min: 5 },
  mixed: { area: true, sqftPerUnit: 2500, min: 1 },
  nonresidential: 0, vacant: 0,
};

/**
 * Land-use classification. Descriptions are matched first (case-insensitive), then numeric codes.
 * Code prefixes follow the Santa Clara County Assessor's use codes; check data/sources/build_report.json
 * (parcel_layer.use_codes) and adjust if the county layer uses a different scheme.
 */
export const USE_RULES = [
  [/vacant|unimproved/i, "vacant"],
  [/mobile|manufactured/i, "mobile"],
  [/condo|townho|planned unit|pud/i, "condo"],
  [/duplex|two units|2 units|double/i, "duplex"],
  [/triplex|three units|3 units/i, "triplex"],
  [/fourplex|four units|4 units|quad/i, "fourplex"],
  [/apart|multi|5\+|five or more|units/i, "multi"],
  [/single|sfr|residen/i, "single"],
  [/mixed|store.*(apt|resid)|commercial.*resid/i, "mixed"],
  [/commerc|office|retail|store|industr|church|school|public|govern|park|parking|hotel|motel|warehouse|exempt|utility|restaurant|bank|garage|service/i, "nonresidential"],
];
export const USE_CODE_RULES = {
  "00": "vacant", "01": "single", "02": "duplex", "03": "triplex", "04": "fourplex", "05": "multi",
  "06": "condo", "07": "mobile", "08": "multi", "09": "single",
};
