// Tract geometry loading: study-area presets, the county manifest, and lazy per-county GeoJSON chunks.
import { AREAS_URL, TRACT_INDEX_URL, TRACT_DATA_BASE } from "./config.js";

let areas = null;            // data/areas.json
let index = null;            // data/tracts/index.json
let outlines = null;         // fips -> simplified county polygon (GeoJSON feature), for viewport tests
const loaded = new Set();    // county fips with geometry on the map
const inFlight = new Map();  // fips -> Promise

export function isFileProtocol() { return location.protocol === "file:"; }

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export async function loadAreas() { areas = await fetchJson(AREAS_URL); return areas; }
export async function loadTractIndex() {
  index = await fetchJson(TRACT_INDEX_URL);
  if (index.outlines_file) {
    try {
      const gj = await fetchJson(TRACT_DATA_BASE + index.outlines_file);
      outlines = Object.fromEntries(gj.features.map((f) => [f.properties.fips, f]));
    } catch (e) { console.warn("county outlines unavailable; falling back to bbox tests", e); }
  }
  return index;
}

export function areaList() { return areas?.areas || []; }
export function areaById(id) { return areaList().find((a) => a.id === id) || null; }
export function allCountyFips() { return Object.keys(index?.counties || {}).sort(); }
export function countyInfo(fips) { return index?.counties?.[fips] || null; }
export function countyName(fips) { return countyInfo(fips)?.name || fips; }

/** Counties that make up an area preset (resolves "all"). */
export function areaCounties(area) {
  return area.counties === "all" ? allCountyFips() : area.counties.filter((f) => countyInfo(f));
}

export function isCountyLoaded(fips) { return loaded.has(fips); }
export function loadedCounties() { return [...loaded].sort(); }
export function loadedTractCount() {
  let n = 0;
  for (const f of loaded) n += countyInfo(f)?.hires_tracts ?? countyInfo(f)?.tracts ?? 0;
  return n;
}

/** Fetch one county's tract polygons (hi-res tier when available) and hand them to `onFeatures`. */
export function loadCounty(fips, onFeatures) {
  if (loaded.has(fips)) return Promise.resolve(false);
  if (inFlight.has(fips)) return inFlight.get(fips);
  const info = countyInfo(fips);
  if (!info) return Promise.reject(new Error(`unknown county ${fips}`));
  const p = (async () => {
    const gj = await fetchJson(TRACT_DATA_BASE + (info.hires_file || info.file));
    const features = (gj.features || []).filter((f) => f.geometry && f.properties?.geoid);
    onFeatures(features, fips);
    loaded.add(fips);
    return true;
  })().finally(() => inFlight.delete(fips));
  inFlight.set(fips, p);
  return p;
}

/** Load several counties, a few at a time. `onProgress(done, total, fips)` after each. */
export async function loadCounties(fipsList, onFeatures, onProgress = () => {}) {
  const todo = [...new Set(fipsList)].filter((f) => !loaded.has(f) && countyInfo(f));
  let done = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const fips = queue.shift();
      await loadCounty(fips, onFeatures);
      done++;
      onProgress(done, todo.length, fips);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return todo;
}

/** Counties whose polygon (or bbox, if outlines failed to load) intersects a Leaflet LatLngBounds. */
export function countiesIntersecting(bounds) {
  const w = bounds.getWest(), s = bounds.getSouth(), e = bounds.getEast(), n = bounds.getNorth();
  const byBbox = allCountyFips().filter((fips) => {
    const [cw, cs, ce, cn] = countyInfo(fips).bbox;
    return cw <= e && ce >= w && cs <= n && cn >= s;
  });
  if (!outlines || !window.turf) return byBbox;
  const view = turf.bboxPolygon([w, s, e, n]);
  return byBbox.filter((fips) => {
    const o = outlines[fips];
    if (!o) return true;
    try { return turf.booleanIntersects(view, o); } catch { return true; }
  });
}

/** Counties containing any of the given geoids. */
export function countiesOf(geoids) {
  return [...new Set([...geoids].map((g) => g.slice(0, 5)))].filter((f) => countyInfo(f)).sort();
}
