// Leaflet map, tract layers, dissolved region polygons and labels.
import { TILE_URL, TILE_ATTRIBUTION, DEFAULT_VIEW } from "./config.js";
import { state, regionIds, scopedRegionIds, regionColor, regionName, displayNumber, tractsOf, isHidden } from "./state.js";
import { regionStats, tractStats, fmtInt } from "./stats.js";

export const map = L.map("map", { preferCanvas: true, zoomControl: false })
  .setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION, opacity: 0.72, crossOrigin: true }).addTo(map);

export const featuresByGeoid = {};   // geoid -> GeoJSON feature
export const tractLayers = {};       // geoid -> L.GeoJSON layer
const regionGroups = {};             // per region: raw tract layers (audit/edit modes)
const presentationGroups = {};       // per region: dissolved fill polygons
const outlineGroups = {};            // per region: dissolved outlines (audit/edit)
const labelGroups = {};              // per region: label marker
const bgGroup = L.featureGroup();    // unassigned tracts

const handlers = { hover: () => {}, click: () => {} };
export function setTractHandlers(h) { Object.assign(handlers, h); }

const clone = (x) => JSON.parse(JSON.stringify(x));

function ensureGroups(id) {
  id = String(id);
  regionGroups[id] ||= L.featureGroup();
  presentationGroups[id] ||= L.featureGroup();
  outlineGroups[id] ||= L.featureGroup();
  labelGroups[id] ||= L.featureGroup();
}

// ---- tract styling -------------------------------------------------------------

export function tractStyle(geoid) {
  const rid = state.assignment[geoid] || 0;
  if (state.mode === "edit") {
    if (rid) return { color: "#fff", weight: 0.65, opacity: 0.9, fillColor: regionColor(rid), fillOpacity: 0.58 };
    return { color: "#6f7b86", weight: 0.55, opacity: 0.48, fillColor: "#b9c1c8", fillOpacity: 0.10 };
  }
  if (rid) {
    return state.mode === "audit"
      ? { color: "#fff", weight: 0.8, opacity: 0.86, fillColor: regionColor(rid), fillOpacity: 0.62 }
      : { color: regionColor(rid), weight: 0.25, opacity: 0.25, fillColor: regionColor(rid), fillOpacity: 0.66 };
  }
  return { color: "#77828c", weight: 0.45, opacity: 0.28, fillOpacity: 0 };
}
export function restyleTract(geoid) { tractLayers[geoid]?.setStyle(tractStyle(geoid)); }
export function highlightTract(geoid) { tractLayers[geoid]?.setStyle({ weight: 2, opacity: 1, fillOpacity: 0.72 }); }

function attach(geoid) {
  const lyr = tractLayers[geoid], rid = state.assignment[geoid] || 0;
  for (const g of Object.values(regionGroups)) if (g.hasLayer(lyr)) g.removeLayer(lyr);
  if (bgGroup.hasLayer(lyr)) bgGroup.removeLayer(lyr);
  if (rid) { ensureGroups(rid); regionGroups[String(rid)].addLayer(lyr); }
  else bgGroup.addLayer(lyr);
}

/** Register tract features (each with properties.geoid). Already-known geoids are skipped. */
export function addTractFeatures(features) {
  for (const ft of features) {
    const geoid = ft.properties?.geoid;
    if (!geoid || tractLayers[geoid]) continue;
    featuresByGeoid[geoid] = ft;
    const lyr = L.geoJSON(ft, { style: tractStyle(geoid) });
    lyr.on("mouseover", () => { highlightTract(geoid); handlers.hover(geoid); });
    lyr.on("mouseout", () => restyleTract(geoid));
    lyr.on("click", () => handlers.click(geoid, lyr));
    tractLayers[geoid] = lyr;
    attach(geoid);
  }
}

/** Re-home every tract layer into its region group after assignments changed. */
export function reattachAllTracts() {
  for (const geoid of Object.keys(tractLayers)) { attach(geoid); restyleTract(geoid); }
}

// ---- dissolved regions + labels ---------------------------------------------------

/** Tract features of a region and their dissolved outline (falls back to raw tracts). */
export function dissolveRegion(id) {
  const fts = tractsOf(id).map((g) => featuresByGeoid[g]).filter(Boolean);
  if (!fts.length || !window.turf) return { fts, display: fts };
  try {
    const tagged = fts.map((f) => { const c = clone(f); c.properties = { region: String(id) }; return c; });
    const d = turf.dissolve(turf.featureCollection(tagged), { propertyName: "region" });
    if (d?.features?.length) return { fts, display: d.features };
  } catch (e) {
    console.warn("dissolve failed; using exact tract polygons", id, e);
  }
  return { fts, display: fts };
}

/** [lat, lon] for the region label: a point inside the largest dissolved piece. */
export function labelPoint(display, fts) {
  try {
    const main = [...display].sort((a, b) => turf.area(b) - turf.area(a))[0] || fts[0];
    let pt = turf.pointOnFeature(main).geometry.coordinates;
    if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) pt = turf.centerOfMass(main).geometry.coordinates;
    return [pt[1], pt[0]];
  } catch (e) {
    console.warn("label placement failed", e);
    return null;
  }
}

export function labelIcon(id, scale = 1) {
  const st = regionStats(id);
  const parts = [
    st.density ? `${fmtInt(st.density)} / sq mi` : "density pending",
    Number.isFinite(st.population) ? `${fmtInt(st.population)} people` : "population pending",
    Number.isFinite(st.land_sqmi) ? `${st.land_sqmi.toFixed(2)} sq mi` : "",
  ].filter(Boolean);
  const w = Math.round(155 * scale), h = Math.round(48 * scale);
  const transform = scale === 1 ? "" : `;transform:scale(${scale});transform-origin:center`;
  return L.divIcon({
    className: "region-label",
    html: `<div class="badge" style="--c:${regionColor(id)}${transform}"><span class="n">${displayNumber(id)}.</span>${regionName(id)}<span class="stat">${parts.join(" · ")}</span></div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
  });
}

export function rebuildRegionGeometry() {
  const known = new Set([...Object.keys(presentationGroups), ...Object.keys(outlineGroups), ...Object.keys(labelGroups), ...Object.keys(regionGroups)]);
  for (const id of known) {
    presentationGroups[id]?.clearLayers();
    outlineGroups[id]?.clearLayers();
    labelGroups[id]?.clearLayers();
    if (!state.regions[id]) {
      for (const dict of [presentationGroups, outlineGroups, labelGroups, regionGroups]) {
        const g = dict[id];
        if (g && map.hasLayer(g)) map.removeLayer(g);
        delete dict[id];
      }
    }
  }
  for (const id of regionIds()) {
    ensureGroups(id);
    const { fts, display } = dissolveRegion(id);
    if (!fts.length) continue;
    for (const ft of display) {
      L.geoJSON(ft, { style: { color: regionColor(id), weight: 2.8, opacity: 1, fillColor: regionColor(id), fillOpacity: 0.66 }, interactive: false }).addTo(presentationGroups[id]);
      L.geoJSON(ft, { style: { color: regionColor(id), weight: 3.0, opacity: 1, fillOpacity: 0 }, interactive: false }).addTo(outlineGroups[id]);
    }
    const pt = labelPoint(display, fts);
    if (pt) L.marker(pt, { icon: labelIcon(id), interactive: false }).addTo(labelGroups[id]);
  }
  applyMode(state.mode);
}

// ---- modes + visibility ---------------------------------------------------------------

export function applyMode(mode) {
  state.mode = mode;
  for (const geoid of Object.keys(tractLayers)) restyleTract(geoid);
  for (const dict of [regionGroups, presentationGroups, outlineGroups, labelGroups]) {
    for (const g of Object.values(dict)) if (map.hasLayer(g)) map.removeLayer(g);
  }
  if (map.hasLayer(bgGroup)) map.removeLayer(bgGroup);
  for (const id of scopedRegionIds()) {
    if (isHidden(id)) continue;
    if (mode === "presentation") { presentationGroups[id]?.addTo(map); labelGroups[id]?.addTo(map); }
    else { regionGroups[id]?.addTo(map); outlineGroups[id]?.addTo(map); }
  }
  if (mode !== "presentation") bgGroup.addTo(map);
}

export function syncRegionVisibility(id) {
  id = String(id);
  const show = !isHidden(id) && scopedRegionIds().includes(id);
  const groups = state.mode === "presentation" ? [presentationGroups[id], labelGroups[id]] : [regionGroups[id], outlineGroups[id]];
  for (const g of groups) {
    if (!g) continue;
    if (show && !map.hasLayer(g)) g.addTo(map);
    else if (!show && map.hasLayer(g)) map.removeLayer(g);
  }
}

/** Bounds of the loaded tract layers belonging to the given regions. */
export function regionBounds(ids = scopedRegionIds()) {
  const b = L.latLngBounds([]);
  for (const id of ids) for (const g of tractsOf(id)) { const lyr = tractLayers[g]; if (lyr) b.extend(lyr.getBounds()); }
  return b;
}
export function fitRegions(ids) {
  const b = regionBounds(ids);
  if (b.isValid()) map.fitBounds(b.pad(0.035));
}
export function resetView() { map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom); }

// ---- popups ----------------------------------------------------------------------------

export function tractCode(geoid) {
  const t = geoid.slice(5);
  return `${t.slice(0, 4)}.${t.slice(4)}`;
}

export function popupHtml(geoid) {
  const rid = state.assignment[geoid] || 0, s = tractStats(geoid), label = state.tractLabels[geoid];
  const title = rid ? `Region ${displayNumber(rid)} — ${regionName(rid)}` : "Unassigned tract";
  const density = Number.isFinite(s.population) && s.land_sqmi > 0 ? `${fmtInt(s.population / s.land_sqmi)}/sq mi` : "not available";
  return `<div class="popup-title">${title}</div>
    <div><b>Tract:</b> ${tractCode(geoid)} <span style="color:#71808c">(${geoid})</span></div>
    ${label ? `<div><b>Area:</b> ${label}</div>` : ""}
    <div><b>Population:</b> ${Number.isFinite(s.population) ? s.population.toLocaleString() : "not available"}</div>
    <div><b>Land area:</b> ${Number.isFinite(s.land_sqmi) ? s.land_sqmi.toFixed(3) + " sq mi" : "not available"}</div>
    <div><b>Density:</b> ${density}</div>`;
}
