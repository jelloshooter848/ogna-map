// Bootstrap: load lots, blocks, city limits and the region set; wire the UI; restore browser saves.
import { APP_VERSION, DEFAULT_REGION_SET_URL, PARCELS_URL, BLOCKS_URL, CITY_URL, DATA_OVERRIDE } from "./config.js";
import { state, applyRegionSet, toRegionSet, regionIds, region } from "./state.js";
import { loadData, lots, setTaxRoll } from "./units.js";
import { map, addBaseLayers, rebuildRegionGeometry, fitRegions, resetView, lotCenter, lotLayers } from "./render.js";
import { $, setStatus, rebuildLegend, updateHistoryButtons, setModeUI, updateTaxStatus, workingCopyStatus, updateMetricLegend } from "./ui.js";
import { wireEditor, wireToolbar, wireTaxImport, rebuildAfterEdit, applyImportedSet, setMode, afterTaxChange } from "./editor.js";
import { wireExport } from "./export.js";
import { parseImport, currentRegionSet, loadBrowser } from "./persist.js";
import { insidePolygon } from "./lasso.js";
import { loadRoll } from "./taxroll.js";
import * as stateApi from "./state.js";
import * as stats from "./stats.js";

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw Object.assign(new Error(`${url}: HTTP ${r.status}`), { status: r.status, url });
  return r.json();
}

/** A region shipped with only a polygon (e.g. the first district draft) gets the lots whose center is inside. */
function seedFromPolygons() {
  let seeded = false;
  for (const id of regionIds()) {
    const r = region(id);
    if (!r.seed_polygon || r.members.size) continue;
    const ring = r.seed_polygon.map(([lng, lat]) => [lat, lng]);
    for (const apn of Object.keys(lotLayers)) { const c = lotCenter(apn); if (c && insidePolygon(c, ring)) r.members.add(apn); }
    delete r.seed_polygon;
    seeded = true;
  }
  if (seeded) applyRegionSet(toRegionSet(), { asBaseline: true });
}

async function boot() {
  console.info(`OGNA map v${APP_VERSION}`);
  setModeUI("presentation");
  wireEditor();
  const applyShading = wireToolbar({ fitRegions: () => fitRegions(regionIds()), resetView });
  wireExport();
  wireTaxImport();

  if (location.protocol === "file:") {
    setStatus("This app must be served over HTTP. From the project folder run <code>python3 -m http.server 8000</code> and open http://localhost:8000/.", { error: true });
    return;
  }

  try {
    setStatus("Loading lots, census blocks and neighborhoods…");
    const [parcels, blocks, city, regionSet] = await Promise.all([
      fetchJson(PARCELS_URL), fetchJson(BLOCKS_URL), fetchJson(CITY_URL).catch(() => null), fetchJson(DEFAULT_REGION_SET_URL),
    ]);
    const n = loadData({ parcels, blocks });
    addBaseLayers(city);
    applyRegionSet(regionSet, { asBaseline: true });
    seedFromPolygons();

    const roll = await loadRoll();
    if (roll) setTaxRoll(roll.roll, roll.meta);
    updateTaxStatus();

    let restored = "";
    try {
      const saved = loadBrowser();
      if (saved) { applyRegionSet(saved); state.dirty = true; restored = ` Restored your browser save from ${new Date(saved.exported_at).toLocaleString()}.`; }
    } catch (e) { console.warn("browser save unreadable", e); }

    applyShading();
    rebuildRegionGeometry(true);
    rebuildLegend();
    updateHistoryButtons();
    updateMetricLegend();
    resetView();
    setStatus(`Ready · ${n.lots.toLocaleString()} lots · ${n.blocks.toLocaleString()} census blocks${DATA_OVERRIDE ? ` · <b>data from ${DATA_OVERRIDE}</b>` : ""}.${restored} ${workingCopyStatus()}`);
  } catch (err) {
    console.error(err);
    if (err.status === 404 && (err.url === PARCELS_URL || err.url === BLOCKS_URL)) {
      setStatus(`The data files are not built yet (${err.url} is missing). They are produced by the <b>Build data</b> GitHub Action; see the README. To try the app with synthetic data, run <code>node scripts/make_fixture.mjs</code> and open <a href="?data=test/fixture/">?data=test/fixture/</a>.`, { error: true });
    } else setStatus(`Could not load the map data. ${err.message}`, { error: true });
  }
}

// Debug / test handle.
window.app = { ...stateApi, stats, lots, map, lotCenter, rebuildAfterEdit, applyImportedSet, setMode, parseImport, currentRegionSet, afterTaxChange, version: APP_VERSION };

boot();
