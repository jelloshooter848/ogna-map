// Transit overlay driven by data files under data/transit/. Each "set" (one per metro area) has
// groups (Metro Rail, BRT, commuter rail, future projects); each group has a lines GeoJSON and a
// stations GeoJSON. The panel gets one row per group with per-line chips.
import { TRANSIT_INDEX_URL, TRANSIT_DATA_BASE, TRANSIT_STORAGE_KEY } from "./config.js";
import { map } from "./render.js";
import { $ } from "./ui.js";

const sets = new Map();        // set id -> { meta, groups: Map(groupId -> group) }
let registry = null;           // data/transit/index.json
let prefs = loadPrefs();       // { [groupId]: { on, stations, lines: { [lineId]: bool } } }
let scopeCounties = null;      // current study area's counties; null = everything is in scope
let scopeName = "";

/** Limit the panel and map layers to transit sets covering these counties. */
export function setTransitScope(counties, areaName = "") {
  scopeCounties = counties ? new Set(counties) : null;
  scopeName = areaName;
  renderPanel();
  syncVisibility();
}
function setInScope(set) {
  return !scopeCounties || set.meta.counties.some((c) => scopeCounties.has(c));
}
function activeSets() { return [...sets.values()].filter(setInScope); }

const STYLE = {
  rail:     { weight: 5.5, opacity: 0.96, dash: null,     export: 7 },
  brt:      { weight: 4.5, opacity: 0.92, dash: null,     export: 6 },
  commuter: { weight: 3.5, opacity: 0.9,  dash: "2 7",    export: 5 },
  future:   { weight: 5,   opacity: 0.92, dash: "11 8",   export: 7 },
};

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(TRANSIT_STORAGE_KEY) || "{}"); } catch { return {}; }
}
function savePrefs() { try { localStorage.setItem(TRANSIT_STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }
function groupPref(g) {
  return (prefs[g.id] ||= { on: g.default_on !== false, stations: g.stations_on !== false, lines: {} });
}
function lineOn(g, lineId) { const p = groupPref(g); return p.lines[lineId] !== false; }

const popup = (title, sub, status) =>
  `<div class="popup-title">${title}</div>${sub ? `<div>${sub}</div>` : ""}${status ? `<div><b>Status:</b> ${status}</div>` : ""}`;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

function latLngParts(g) {
  if (!g) return [];
  if (g.type === "LineString") return [g.coordinates.map((c) => [c[1], c[0]])];
  if (g.type === "MultiLineString") return g.coordinates.map((part) => part.map((c) => [c[1], c[0]]));
  return [];
}

// ---- loading ------------------------------------------------------------------------------------

export async function loadTransitRegistry() {
  registry = await fetchJson(TRANSIT_INDEX_URL);
  return registry;
}

/** Load every transit set that covers any of the given counties (idempotent). */
export async function syncTransitForCounties(countyFips) {
  if (!registry) return;
  const want = registry.sets.filter((s) => s.counties.some((c) => countyFips.includes(c)) && !sets.has(s.id));
  for (const s of want) {
    sets.set(s.id, { meta: s, groups: new Map(), loading: true });
    try {
      const idx = await fetchJson(TRANSIT_DATA_BASE + s.file);
      const set = sets.get(s.id);
      set.index = idx;
      for (const g of idx.groups) {
        const base = TRANSIT_DATA_BASE + s.file.replace(/[^/]*$/, "");
        const [lines, stations] = await Promise.all([
          fetchJson(base + g.lines_file),
          g.stations_file ? fetchJson(base + g.stations_file) : { features: [] },
        ]);
        set.groups.set(g.id, buildGroup(g, lines.features || [], stations.features || []));
      }
      set.loading = false;
    } catch (e) {
      console.error("transit set failed", s.id, e);
      sets.get(s.id).error = e.message;
      sets.get(s.id).loading = false;
    }
  }
  if (want.length) { renderPanel(); syncVisibility(); }
}

function buildGroup(meta, lineFeatures, stationFeatures) {
  const style = STYLE[meta.kind] || STYLE.rail;
  const lines = new Map();
  for (const f of lineFeatures) {
    const p = f.properties || {};
    const id = p.id || p.name;
    const line = lines.get(id) || { id, props: p, parts: [], layer: L.layerGroup() };
    for (const coords of latLngParts(f.geometry)) {
      if (coords.length < 2) continue;
      line.parts.push(coords);
      L.polyline(coords, { color: p.color || "#26323b", weight: style.weight, opacity: style.opacity, dashArray: style.dash })
        .bindPopup(popup(p.name, [p.operator, meta.name].filter(Boolean).join(" · "), p.status || (meta.kind === "future" ? "Planned" : "Operating")))
        .addTo(line.layer);
    }
    lines.set(id, line);
  }
  const stations = stationFeatures.filter((f) => f.geometry?.type === "Point").map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry.coordinates;
    return { lat, lon, name: p.name || "Station", lines: p.lines || [], status: p.status, schematic: !!p.schematic };
  });
  return { meta, style, lines, stations, stationLayer: L.layerGroup() };
}

// ---- visibility ---------------------------------------------------------------------------------------

function stationColor(g, s) {
  const first = s.lines.map((id) => g.lines.get(id)).find(Boolean);
  return first?.props.color || "#26323b";
}

function rebuildStations(g) {
  g.stationLayer.clearLayers();
  const p = groupPref(g.meta);
  if (!p.on || !p.stations) return;
  for (const s of g.stations) {
    const visible = s.lines.length === 0 || s.lines.some((id) => lineOn(g.meta, id));
    if (!visible) continue;
    const hollow = g.meta.kind === "future" || s.schematic;
    L.circleMarker([s.lat, s.lon], {
      radius: g.meta.kind === "commuter" ? 4.5 : 5.5, weight: 2,
      color: hollow ? stationColor(g, s) : "#fff",
      fillColor: hollow ? "#fff" : (g.meta.kind === "commuter" ? "#3b4a58" : "#111827"), fillOpacity: 1, opacity: 1,
    }).bindPopup(popup(s.name, `${g.meta.name}${s.lines.length ? " · " + s.lines.map((id) => g.lines.get(id)?.props.short || id).join(", ") : ""}`, s.status))
      .addTo(g.stationLayer);
  }
}

export function syncVisibility() {
  for (const set of sets.values()) {
    const inScope = setInScope(set);
    for (const g of set.groups.values()) {
      const p = groupPref(g.meta);
      for (const line of g.lines.values()) {
        const show = inScope && p.on && lineOn(g.meta, line.id);
        if (show && !map.hasLayer(line.layer)) line.layer.addTo(map);
        if (!show && map.hasLayer(line.layer)) map.removeLayer(line.layer);
      }
      if (inScope) { rebuildStations(g); if (!map.hasLayer(g.stationLayer)) g.stationLayer.addTo(map); }
      else if (map.hasLayer(g.stationLayer)) map.removeLayer(g.stationLayer);
    }
  }
  savePrefs();
}

// ---- panel ---------------------------------------------------------------------------------------------

function renderPanel() {
  const host = $("transitGroups");
  host.innerHTML = "";
  let anyGroups = false;
  const active = activeSets();
  for (const set of active) {
    if (set.error) { host.insertAdjacentHTML("beforeend", `<div class="transit-status">Could not load ${set.meta.name} transit: ${set.error}</div>`); continue; }
    for (const g of set.groups.values()) {
      anyGroups = true;
      const p = groupPref(g.meta);
      const row = document.createElement("div");
      row.className = "transit-group";
      const nLines = g.lines.size, nStations = g.stations.length;
      row.innerHTML = `
        <div class="transit-group-head">
          <label class="transit-check"><input type="checkbox" data-group="${g.meta.id}" ${p.on ? "checked" : ""}>${g.meta.name}</label>
          <label class="transit-check transit-stations-toggle" title="Show stations"><input type="checkbox" data-stations="${g.meta.id}" ${p.stations ? "checked" : ""} ${p.on ? "" : "disabled"}>Stations <span class="count">${nStations}</span></label>
        </div>
        <div class="transit-lines">${[...g.lines.values()].sort((a, b) => (a.props.short || "").localeCompare(b.props.short || "", undefined, { numeric: true })).map((line) => `
          <label class="line-chip ${p.on && lineOn(g.meta, line.id) ? "on" : ""}" style="--c:${line.props.color || "#26323b"}" title="${line.props.name}${line.props.status ? " · " + line.props.status : ""}">
            <input type="checkbox" data-line="${g.meta.id}|${line.id}" ${lineOn(g.meta, line.id) ? "checked" : ""} ${p.on ? "" : "disabled"}><span class="sw"></span>${line.props.short || line.props.name}
          </label>`).join("")}</div>
        ${g.meta.note ? `<div class="transit-note">${g.meta.note}</div>` : ""}`;
      host.appendChild(row);
      row.querySelector(`input[data-group]`).onchange = (e) => { p.on = e.target.checked; renderPanel(); syncVisibility(); };
      row.querySelector(`input[data-stations]`).onchange = (e) => { p.stations = e.target.checked; syncVisibility(); };
      for (const cb of row.querySelectorAll("input[data-line]")) {
        cb.onchange = (e) => {
          const lineId = e.target.dataset.line.split("|")[1];
          p.lines[lineId] = e.target.checked;
          e.target.closest(".line-chip").classList.toggle("on", e.target.checked);
          syncVisibility();
        };
      }
      void nLines;
    }
  }
  const st = $("transitStatus");
  const covered = registry ? registry.sets.filter((s) => !scopeCounties || s.counties.some((c) => scopeCounties.has(c))) : [];
  if (!anyGroups) {
    if (active.some((s) => s.loading)) st.textContent = "Loading transit layers…";
    else if (!covered.length) st.textContent = `No transit data for ${scopeName || "this study area"} yet. Transit sets are defined in data/transit/index.json.`;
    else st.textContent = "Transit layers load once a covered county is on the map.";
  } else {
    const parts = [];
    for (const set of active) for (const g of set.groups.values()) parts.push(`${g.meta.name}: ${g.lines.size} lines · ${g.stations.length} stations`);
    st.textContent = parts.join(" · ");
  }
}

/** Draw the currently visible transit layers onto an off-screen export map. */
export function addTransitToExport(em) {
  for (const set of activeSets()) {
    for (const g of set.groups.values()) {
      const p = groupPref(g.meta);
      if (!p.on) continue;
      for (const line of g.lines.values()) {
        if (!lineOn(g.meta, line.id)) continue;
        for (const coords of line.parts) {
          L.polyline(coords, { color: line.props.color || "#26323b", weight: g.style.export, opacity: 0.97, dashArray: g.style.dash ? g.style.dash.split(" ").map((n) => Math.round(+n * 1.3)).join(" ") : null }).addTo(em);
        }
      }
      if (!p.stations) continue;
      for (const s of g.stations) {
        if (s.lines.length && !s.lines.some((id) => lineOn(g.meta, id))) continue;
        const hollow = g.meta.kind === "future" || s.schematic;
        L.circleMarker([s.lat, s.lon], { radius: 5, weight: 2, color: hollow ? stationColor(g, s) : "#fff", fillColor: hollow ? "#fff" : "#17202a", fillOpacity: 1 }).addTo(em);
      }
    }
  }
}

export function transitSummary() {
  const out = [];
  for (const set of activeSets()) for (const g of set.groups.values()) out.push({ set: set.meta.id, group: g.meta.id, lines: g.lines.size, stations: g.stations.length });
  return out;
}
