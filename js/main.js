// Bootstrap: load stats, county index, area presets and the region set; wire the UI; load tract
// geometry per county for the chosen study area (and on demand as the viewport moves).
import { APP_VERSION, DEFAULT_REGION_SET_URL, STATS_URL, AREA_STORAGE_KEY, VIEWPORT_LOAD_MIN_ZOOM } from "./config.js";
import { state, applyRegionSet, setAreaScope, scopedRegionIds, tractsOf } from "./state.js";
import { loadStats, setBenchmark, benchmark, fmtInt } from "./stats.js";
import * as data from "./data.js";
import { map, addTractFeatures, rebuildRegionGeometry, tractLayers, fitRegions, resetView, regionBounds } from "./render.js";
import { $, setStatus, rebuildLegend, updateHistoryButtons, setModeUI, renderAreaSelect, setAreaStatus } from "./ui.js";
import { wireEditor, wireToolbar, rebuildAfterEdit, applyImportedSet, setMode } from "./editor.js";
import { wireExport } from "./export.js";
import { loadTransitRegistry, syncTransitForCounties, setTransitScope } from "./transit.js";
import { parseImport, currentRegionSet } from "./persist.js";
import * as stateApi from "./state.js";

let currentAreaId = null;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** Resolve an area id ("la", "bay-area", "county:06073", …) to { id, name, short, counties, view?, bbox? }. */
function areaSpec(id) {
  if (!id) return null;
  if (id.startsWith("county:")) {
    const fips = id.slice(7), info = data.countyInfo(fips);
    return info ? { id, name: `${info.name} County`, short: info.name, counties: [fips], bbox: info.bbox } : null;
  }
  const a = data.areaById(id);
  return a ? { ...a, counties: data.areaCounties(a) } : null;
}

/** Download counties into the map. Returns the list that was actually fetched. */
async function loadIntoMap(fipsList, label, { rebuild = false, progress = true } = {}) {
  let touchedRegions = false;
  const fetched = await data.loadCounties(fipsList, (features) => {
    addTractFeatures(features);
    if (!touchedRegions) touchedRegions = features.some((f) => state.assignment[f.properties.geoid]);
  }, (done, total, fips) => { if (progress) setAreaStatus(`${label}: ${done}/${total} counties loaded (${data.countyName(fips)})…`); });
  if (rebuild && touchedRegions) rebuildRegionGeometry();
  if (fetched.length) syncTransitForCounties(data.loadedCounties()).catch((e) => console.warn("transit sync failed", e));
  return fetched;
}

/** Tracts belonging to regions listed in the current study area. */
function scopedTracts() { return scopedRegionIds().flatMap((id) => tractsOf(id)); }

function readyStatus(area) {
  const tracts = scopedTracts();
  const target = tracts.length, missing = tracts.filter((g) => !tractLayers[g]).length;
  const unloaded = data.countiesOf(tracts).filter((f) => !data.isCountyLoaded(f));
  let s = `Ready · ${area.name} · ${data.loadedTractCount().toLocaleString()} tracts in ${data.loadedCounties().length} count${data.loadedCounties().length === 1 ? "y" : "ies"} loaded`;
  const n = scopedRegionIds().length;
  if (n === 0) s += " · no regions in this area yet.";
  else if (missing === 0) s += ` · ${n} region${n === 1 ? "" : "s"}, all ${target.toLocaleString()} tracts on the map.`;
  else if (unloaded.length) s += ` · ${missing} region tracts are in ${unloaded.length} unloaded count${unloaded.length === 1 ? "y" : "ies"}.`;
  else s += ` · ${missing} region tracts have no geometry (water-only tracts?).`;
  return s;
}

function areaStatusText(area) {
  const b = benchmark();
  const inArea = area.counties.filter((f) => data.isCountyLoaded(f)).length;
  return `${area.name}: ${fmtInt(b.population)} people · ${fmtInt(b.land_sqmi)} land sq mi · ${fmtInt(b.density)}/sq mi. ${inArea}/${area.counties.length} area counties loaded, ${data.loadedCounties().length} total.`;
}

export async function setArea(id, { persist = true } = {}) {
  const area = areaSpec(id) || areaSpec(state.defaultArea) || areaSpec("la") || areaSpec(`county:${data.allCountyFips()[0]}`);
  currentAreaId = area.id;
  $("areaSelect").value = area.id;
  setBenchmark(area.counties, area.short || area.name);
  setAreaScope(area.id, area.counties);
  setTransitScope(area.counties, area.short || area.name);
  if (persist) { try { localStorage.setItem(AREA_STORAGE_KEY, area.id); } catch { /* ignore */ } }
  rebuildLegend();

  setStatus(`Loading tract geometry for ${area.name}…`);
  const wanted = [...new Set([...area.counties, ...data.countiesOf(scopedTracts())])];
  try {
    await loadIntoMap(wanted, area.short || area.name);
  } catch (e) {
    console.error(e);
    setStatus(`Could not load tract geometry: ${e.message}`, { error: true });
    return;
  }
  rebuildLegend();
  rebuildRegionGeometry();
  setStatus(readyStatus(area));
  setAreaStatus(areaStatusText(area));

  const inArea = scopedRegionIds().filter((rid) => tractsOf(rid).length > 0);
  const b = inArea.length ? regionBounds(inArea) : null;
  if (b && b.isValid()) map.fitBounds(b.pad(0.035));
  else if (area.view) map.setView(area.view.center, area.view.zoom);
  else if (area.bbox) map.fitBounds([[area.bbox[1], area.bbox[0]], [area.bbox[3], area.bbox[2]]]);
}

async function loadAllCalifornia() {
  const btn = $("loadAllBtn");
  btn.disabled = true;
  try {
    await loadIntoMap(data.allCountyFips(), "California", { rebuild: true });
    const area = areaSpec(currentAreaId);
    setStatus(readyStatus(area));
    setAreaStatus(areaStatusText(area));
  } catch (e) {
    setStatus(`Could not load all counties: ${e.message}`, { error: true });
  } finally {
    btn.disabled = false;
  }
}

let viewportTimer = null;
function onMoveEnd() {
  if (map.getZoom() < VIEWPORT_LOAD_MIN_ZOOM) return;
  const need = data.countiesIntersecting(map.getBounds()).filter((f) => !data.isCountyLoaded(f));
  if (!need.length) return;
  clearTimeout(viewportTimer);
  viewportTimer = setTimeout(async () => {
    try {
      await loadIntoMap(need, "Viewport", { rebuild: true, progress: false });
      const area = areaSpec(currentAreaId);
      if (area) { setAreaStatus(areaStatusText(area)); if (/^Ready/.test($("status").textContent)) setStatus(readyStatus(area)); }
    } catch (e) { console.warn("viewport load failed", e); }
  }, 250);
}

async function boot() {
  console.info(`Density + Transit Explorer v${APP_VERSION}`);
  setModeUI("presentation");
  wireEditor();
  wireToolbar({ fitRegions: () => fitRegions(), resetView });
  wireExport();

  if (data.isFileProtocol()) {
    setStatus("This app must be served over HTTP. From the project folder run <code>python3 -m http.server 8000</code> and open http://localhost:8000/.", { error: true });
    $("transitStatus").textContent = "Transit overlay disabled (file:// mode).";
    setAreaStatus("");
    return;
  }

  try {
    setStatus("Loading 2020 Census statistics, the county index and the region set…");
    const [, regionSet] = await Promise.all([
      loadStats(STATS_URL), fetchJson(DEFAULT_REGION_SET_URL), data.loadAreas(), data.loadTractIndex(),
      loadTransitRegistry().catch((e) => { console.warn("transit registry unavailable", e); $("transitStatus").textContent = "Transit data unavailable."; }),
    ]);
    applyRegionSet(regionSet, { asBaseline: true });
    document.title = `${state.setName} · Density + Transit Explorer`;

    renderAreaSelect(data.areaList(), data.allCountyFips().map((f) => ({ fips: f, name: data.countyName(f) })), state.defaultArea);
    $("areaSelect").onchange = (e) => setArea(e.target.value);
    $("loadAllBtn").onclick = loadAllCalifornia;
    map.on("moveend", onMoveEnd);
    rebuildLegend();
    updateHistoryButtons();

    let areaId = state.defaultArea;
    try { areaId = localStorage.getItem(AREA_STORAGE_KEY) || areaId; } catch { /* ignore */ }
    await setArea(areaId, { persist: false });
  } catch (err) {
    console.error(err);
    setStatus(`Could not load the map data. ${err.message}`, { error: true });
  }
}

// Debug / test handle: window.app.state, window.app.assignTract(...), window.app.setArea("bay-area"), etc.
window.app = { ...stateApi, data, map, rebuildAfterEdit, applyImportedSet, setMode, setArea, parseImport, currentRegionSet, version: APP_VERSION };

boot();
