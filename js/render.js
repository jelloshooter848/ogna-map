// Leaflet map: lot and block layers, choropleth metrics, region shapes and labels, the three modes.
import { TILE_URL, TILE_ATTRIBUTION, DEFAULT_VIEW } from "./config.js";
import { state, regionIds, regionColor, regionName, displayNumber, membersOf, regionsOf, isHidden, isDistrict, districtId, neighborhoodCount } from "./state.js";
import { regionStats, fmtInt, fmtPop, fmtDensity, fmtMoney, fmtSqft, fmtPct } from "./stats.js";
import { lots, blocks, lotFeatures, blockFeatures, lotTax } from "./units.js";

export const map = L.map("map", { preferCanvas: true, zoomControl: false }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer(TILE_URL, { maxZoom: 20, maxNativeZoom: 19, attribution: TILE_ATTRIBUTION, opacity: 0.72, crossOrigin: true }).addTo(map);
// Region shapes and labels sit above the lots but are display-only: their canvases must not swallow
// the clicks meant for the lots underneath.
for (const [name, z] of [["regions", 420], ["district", 430], ["labels", 640]]) {
  const pane = map.createPane(name);
  pane.style.zIndex = z;
  pane.style.pointerEvents = "none";
}

export const lotLayers = {};              // apn -> Leaflet path
const lotCenters = {};                    // apn -> [lat, lng]
let lotGroup = null, blockGroup = null, cityGroup = null;
const regionLayers = {};                  // id -> { fill, outline, label, sig }

const handlers = { hover: () => {}, click: () => {} };
export function setLotHandlers(h) { Object.assign(handlers, h); }

export const view = { metric: "none", unit: "lots", activeRegion: null };

// ---- metrics -----------------------------------------------------------------------------------------

const lotAcres = (l) => { const b = blocks.get(l.block); return b && b.lotSqft > 0 ? b.land_acres * (l.sqft / b.lotSqft) : null; };
const USE_COLORS = { single: "#f6ad55", condo: "#ed8936", mobile: "#fbd38d", duplex: "#dd6b20", triplex: "#c05621", fourplex: "#c05621", multi: "#9c4221", mixed: "#805ad5", nonresidential: "#4299e1", vacant: "#a0aec0", unknown: "#e2e8f0" };
const USE_LABELS = { single: "Single family", condo: "Condo / townhouse", mobile: "Mobile home", duplex: "Duplex", triplex: "Triplex", fourplex: "Fourplex", multi: "Apartments (5+)", mixed: "Mixed use", nonresidential: "Non-residential", vacant: "Vacant", unknown: "Unknown use" };

/** Each metric: label, per-lot value, optional per-block value, formatter. */
export const METRICS = {
  none: { label: "No shading" },
  density: { label: "Residents per acre (est.)", lot: (l) => { const a = lotAcres(l); return a ? l.est.pop / a : null; }, block: (b) => (b.land_acres > 0 ? b.pop / b.land_acres : null), fmt: (v) => v.toFixed(1) },
  hu_acre: { label: "Housing units per acre (est.)", lot: (l) => { const a = lotAcres(l); return a ? l.est.hu / a : null; }, block: (b) => (b.land_acres > 0 ? b.hu / b.land_acres : null), fmt: (v) => v.toFixed(1) },
  pop: { label: "Residents per lot (est.)", lot: (l) => l.est.pop, block: (b) => b.pop, fmt: (v) => v.toFixed(v < 10 ? 1 : 0) },
  renter: { label: "Renter share (census block)", lot: (l) => { const b = blocks.get(l.block); return b?.occ > 0 ? b.rent / b.occ : null; }, block: (b) => (b.occ > 0 ? b.rent / b.occ : null), fmt: (v) => fmtPct(v) },
  use: { label: "Land use", categorical: true, lot: (l) => l.cls },
  year: { label: "Year built", lot: (l) => (l.year > 1800 ? l.year : null), fmt: (v) => String(Math.round(v)) },
  tax: { label: "Property tax per lot", lot: (l) => lotTax(l.apn).amount, fmt: (v) => fmtMoney(v) },
  tax_sqft: { label: "Property tax per sq ft of lot", lot: (l) => { const t = lotTax(l.apn).amount; return t !== null && l.sqft > 0 ? t / l.sqft : null; }, fmt: (v) => "$" + v.toFixed(2) },
  coverage: { label: "Neighborhoods per lot", categorical: true, lot: (l) => neighborhoodCount(l.apn) },
};
const RAMP = ["#fff7ec", "#fee8c8", "#fdd49e", "#fdbb84", "#fc8d59", "#e34a33", "#b30000"];
const COVERAGE_COLORS = ["#e53e3e", "#48bb78", "#2f855a", "#22543d"];
let breaks = null;

function computeBreaks() {
  const m = METRICS[view.metric];
  breaks = null;
  if (!m?.lot || m.categorical) return;
  const vals = [];
  if (view.unit === "blocks" && m.block) { for (const b of blocks.values()) { const v = m.block(b); if (Number.isFinite(v)) vals.push(v); } }
  else for (const l of lots.values()) { const v = m.lot(l); if (Number.isFinite(v) && (view.metric !== "pop" || v > 0)) vals.push(v); }
  if (!vals.length) return;
  vals.sort((a, b) => a - b);
  breaks = RAMP.slice(1).map((_, i) => vals[Math.floor(((i + 1) * vals.length) / RAMP.length)]);
  breaks.min = vals[0]; breaks.max = vals[vals.length - 1];
}
function rampColor(v) {
  if (!breaks || !Number.isFinite(v)) return null;
  let i = 0;
  while (i < breaks.length && v >= breaks[i]) i++;
  return RAMP[i];
}
function metricColor(value) {
  const m = METRICS[view.metric];
  if (view.metric === "use") return USE_COLORS[value] || USE_COLORS.unknown;
  if (view.metric === "coverage") return COVERAGE_COLORS[Math.min(value, 3)];
  return m?.categorical ? null : rampColor(value);
}

/** Legend entries for the current metric: [{ color, label }]. */
export function metricLegend() {
  const m = METRICS[view.metric];
  if (!m?.lot) return [];
  if (view.metric === "use") {
    const present = new Set([...lots.values()].map((l) => l.cls));
    return Object.keys(USE_COLORS).filter((k) => present.has(k)).map((k) => ({ color: USE_COLORS[k], label: USE_LABELS[k] }));
  }
  if (view.metric === "coverage") return [{ color: COVERAGE_COLORS[0], label: "In the district, no neighborhood" }, { color: COVERAGE_COLORS[1], label: "1 neighborhood" }, { color: COVERAGE_COLORS[2], label: "2 neighborhoods" }, { color: COVERAGE_COLORS[3], label: "3 or more" }];
  if (!breaks) return [{ color: "#e2e8f0", label: view.metric.startsWith("tax") ? "No tax data yet: import a tax roll" : "No data" }];
  const f = m.fmt || ((v) => String(v));
  const edges = [breaks.min, ...breaks, breaks.max];
  return RAMP.map((c, i) => ({ color: c, label: `${f(edges[i])} – ${f(edges[i + 1])}` }));
}

// ---- lot styling ---------------------------------------------------------------------------------------

export function lotStyle(apn) {
  const l = lots.get(apn);
  const inDistrict = districtId() && membersOf(districtId()).has(apn);
  if (state.mode === "edit") {
    const rid = view.activeRegion;
    if (rid && membersOf(rid).has(apn)) return { color: "#fff", weight: 0.6, opacity: 0.9, fillColor: regionColor(rid), fillOpacity: 0.62 };
    const others = regionsOf(apn).filter((id) => id !== String(rid) && !isDistrict(id));
    if (others.length) return { color: "#fff", weight: 0.5, opacity: 0.7, fillColor: "#718096", fillOpacity: 0.28 };
    return { color: "#6f7b86", weight: 0.5, opacity: inDistrict ? 0.55 : 0.3, fillColor: "#cbd5e0", fillOpacity: inDistrict ? 0.12 : 0.04 };
  }
  if (view.unit === "lots" && view.metric !== "none" && l) {
    const v = METRICS[view.metric].lot(l);
    if (view.metric === "coverage" && !inDistrict && v === 0) return { color: "#8795a1", weight: 0.3, opacity: 0.3, fillOpacity: 0 };
    const c = metricColor(v);
    if (c) return { color: "#ffffff", weight: 0.35, opacity: 0.6, fillColor: c, fillOpacity: state.mode === "presentation" ? 0.7 : 0.8 };
    return { color: "#8795a1", weight: 0.3, opacity: 0.35, fillColor: "#e2e8f0", fillOpacity: 0.25 };
  }
  if (state.mode === "audit") return { color: "#5a6772", weight: 0.5, opacity: 0.55, fillColor: "#cbd5e0", fillOpacity: 0.08 };
  return { color: "#5a6772", weight: 0.3, opacity: 0.18, fillOpacity: 0 };
}
export function restyleLot(apn) { lotLayers[apn]?.setStyle(lotStyle(apn)); }
export function restyleAllLots() { for (const apn of Object.keys(lotLayers)) restyleLot(apn); }
function highlightLot(apn) { lotLayers[apn]?.setStyle({ weight: 2.2, opacity: 1, color: "#1a202c" }); }

function blockStyle(f) {
  const m = METRICS[view.metric];
  const b = blocks.get(f.properties.id);
  const c = m?.block && b ? rampColor(m.block(b)) : null;
  return c ? { color: "#fff", weight: 0.5, opacity: 0.7, fillColor: c, fillOpacity: 0.72 } : { color: "#8795a1", weight: 0.4, opacity: 0.35, fillOpacity: 0.03 };
}

export function lotCenter(apn) { return lotCenters[apn]; }

/** Build lot, block and city-limit layers once the data is loaded. */
export function addBaseLayers(cityLimits) {
  lotGroup = L.geoJSON({ type: "FeatureCollection", features: [...lotFeatures.values()] }, {
    style: (f) => lotStyle(f.properties.apn),
    onEachFeature: (f, lyr) => {
      const apn = f.properties.apn;
      lotLayers[apn] = lyr;
      const c = lyr.getBounds().getCenter();
      lotCenters[apn] = [c.lat, c.lng];
      lyr.on("mouseover", () => { highlightLot(apn); handlers.hover(apn); });
      lyr.on("mouseout", () => restyleLot(apn));
      lyr.on("click", (e) => handlers.click(apn, lyr, e));
    },
  });
  blockGroup = L.geoJSON({ type: "FeatureCollection", features: [...blockFeatures.values()] }, {
    style: blockStyle,
    onEachFeature: (f, lyr) => lyr.bindTooltip(() => blockTooltip(f.properties.id), { sticky: true }),
  });
  if (cityLimits) cityGroup = L.geoJSON(cityLimits, { interactive: false, style: { color: "#4a5568", weight: 1.5, dashArray: "2 5", fill: false, opacity: 0.7 } }).addTo(map);
  applyUnit();
}

/** Switch between lot and block display. */
export function applyUnit() {
  if (!lotGroup) return;
  const blocksOn = view.unit === "blocks" && state.mode !== "edit";
  if (blocksOn) { if (map.hasLayer(lotGroup)) map.removeLayer(lotGroup); blockGroup.addTo(map); blockGroup.setStyle(blockStyle); }
  else { if (map.hasLayer(blockGroup)) map.removeLayer(blockGroup); lotGroup.addTo(map); }
}

export function setMetric(metric, unit = view.unit) {
  view.metric = METRICS[metric] ? metric : "none";
  view.unit = unit;
  computeBreaks();
  applyUnit();
  restyleAllLots();
}
export function refreshMetric() { computeBreaks(); restyleAllLots(); if (view.unit === "blocks") blockGroup?.setStyle(blockStyle); }

// ---- region shapes ---------------------------------------------------------------------------------------

/** Cheap signature of a member set so unchanged regions keep their cached geometry. */
function signature(members) {
  let h = members.size;
  for (const a of members) { let x = 0; for (let i = 0; i < a.length; i++) x = (x * 31 + a.charCodeAt(i)) | 0; h = (h + x) | 0; }
  return `${members.size}:${h}`;
}

const marginCache = new Map(); // block id -> the block's street margin (block minus all its lots)
const fc = (fs) => turf.featureCollection(fs.map((f) => turf.feature(f.geometry)));

/**
 * Some of a block's lots: the lots themselves, grown into the street margin (never into neighbouring
 * lots) so the shape meets full blocks at the street centerline instead of leaving a gap.
 */
function partialBlock(blockId, apns) {
  const own = apns.map((a) => lotFeatures.get(a)).filter(Boolean);
  try {
    if (!marginCache.has(blockId)) {
      const all = blocks.get(blockId).lots.map((l) => lotFeatures.get(l.apn)).filter(Boolean);
      const lotsUnion = all.length > 1 ? turf.union(fc(all)) : turf.feature(all[0].geometry);
      marginCache.set(blockId, turf.difference(fc([blockFeatures.get(blockId), lotsUnion])));
    }
    const margin = marginCache.get(blockId);
    if (!margin) return own;
    const grown = turf.buffer(own.length > 1 ? turf.union(fc(own)) : turf.feature(own[0].geometry), 20, { units: "meters" });
    const edge = grown && turf.intersect(fc([grown, margin]));
    return edge ? [...own, edge] : own;
  } catch (e) {
    return own;
  }
}

/**
 * Region outline: whole census blocks where the region holds every lot in the block (blocks run to the
 * street centerline, so neighbouring full blocks merge without gaps), exact lot polygons elsewhere.
 */
export function dissolveRegion(id) {
  const members = membersOf(id);
  const pieces = [];
  const byBlock = new Map();
  for (const apn of members) {
    const l = lots.get(apn);
    if (!l) continue;
    const k = l.block || `lot:${apn}`;
    (byBlock.get(k) || byBlock.set(k, []).get(k)).push(apn);
  }
  for (const [k, apns] of byBlock) {
    const b = k.startsWith("lot:") ? null : blocks.get(k);
    if (b && apns.length === b.lots.length && blockFeatures.get(k)) pieces.push(blockFeatures.get(k));
    else if (b && blockFeatures.get(k) && window.turf) pieces.push(...partialBlock(k, apns));
    else for (const a of apns) if (lotFeatures.get(a)) pieces.push(lotFeatures.get(a));
  }
  if (!pieces.length || !window.turf) return { fts: pieces, display: pieces };
  try {
    const fc = turf.featureCollection(pieces.map((f) => turf.feature(f.geometry)));
    const u = pieces.length > 1 ? turf.union(fc) : fc.features[0];
    if (u) return { fts: pieces, display: [u] };
  } catch (e) {
    console.warn("union failed; drawing pieces", id, e);
  }
  return { fts: pieces, display: pieces };
}

/** [lat, lon] for a label: a point inside the largest polygon of the shape. */
export function labelPoint(display) {
  try {
    const polys = display.flatMap((f) => (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map((c) => turf.polygon(c)) : [f]));
    const main = polys.sort((a, b) => turf.area(b) - turf.area(a))[0];
    const pt = turf.pointOnFeature(main).geometry.coordinates;
    return [pt[1], pt[0]];
  } catch (e) {
    console.warn("label placement failed", e);
    return null;
  }
}

export function labelIcon(id, scale = 1) {
  const st = regionStats(id);
  const parts = [fmtPop(st.pop), `${fmtDensity(st.density_acre)}`].filter(Boolean);
  const w = Math.round(150 * scale), h = Math.round(44 * scale);
  const transform = scale === 1 ? "" : `;transform:scale(${scale});transform-origin:center`;
  const num = displayNumber(id);
  return L.divIcon({
    className: "region-label",
    html: `<div class="badge" style="--c:${regionColor(id)}${transform}">${num ? `<span class="n">${num}.</span>` : ""}${escapeHtml(regionName(id))}<span class="stat">${parts.join(" · ")} est.</span></div>`,
    iconSize: [w, h], iconAnchor: [w / 2, h / 2],
  });
}

function styleFor(id) {
  const c = regionColor(id);
  if (isDistrict(id)) return { outline: { color: c, weight: 3.2, opacity: 0.9, dashArray: "10 6", fill: false } };
  return {
    fill: { color: c, weight: 2.4, opacity: 0.95, fillColor: c, fillOpacity: 0.22 },
    outline: { color: c, weight: 2.6, opacity: 1, fill: false },
  };
}

/** Rebuild shapes for regions whose membership changed (all regions when `force`). */
export function rebuildRegionGeometry(force = false) {
  for (const id of Object.keys(regionLayers)) {
    if (!state.regions[id]) { removeRegionLayers(id); delete regionLayers[id]; }
  }
  for (const id of regionIds()) {
    const sig = `${signature(membersOf(id))}|${regionColor(id)}|${regionName(id)}`;
    const cur = regionLayers[id];
    if (cur && cur.sig === sig && !force) { refreshLabel(id); continue; }
    if (cur) removeRegionLayers(id);
    const { display } = dissolveRegion(id);
    const st = styleFor(id);
    const pane = isDistrict(id) ? "district" : "regions";
    const entry = { sig, fill: L.featureGroup(), outline: L.featureGroup(), label: L.featureGroup(), display };
    for (const ft of display) {
      if (st.fill) L.geoJSON(ft, { pane, style: st.fill, interactive: false }).addTo(entry.fill);
      L.geoJSON(ft, { pane, style: st.outline, interactive: false }).addTo(entry.outline);
    }
    regionLayers[id] = entry;
    refreshLabel(id);
  }
  applyMode(state.mode);
}
function refreshLabel(id) {
  const e = regionLayers[id];
  if (!e) return;
  e.label.clearLayers();
  if (isDistrict(id) || !e.display.length) return;
  const pt = labelPoint(e.display);
  if (pt) L.marker(pt, { icon: labelIcon(id), interactive: false, pane: "labels" }).addTo(e.label);
}
function removeRegionLayers(id) {
  const e = regionLayers[id];
  if (!e) return;
  for (const g of [e.fill, e.outline, e.label]) if (map.hasLayer(g)) map.removeLayer(g);
}

// ---- modes + visibility ----------------------------------------------------------------------------------

export function applyMode(mode) {
  state.mode = mode;
  applyUnit();
  restyleAllLots();
  for (const id of Object.keys(regionLayers)) removeRegionLayers(id);
  for (const id of regionIds()) syncRegionVisibility(id);
}

export function syncRegionVisibility(id) {
  id = String(id);
  const e = regionLayers[id];
  if (!e) return;
  removeRegionLayers(id);
  if (isHidden(id)) return;
  const mode = state.mode;
  const want = [];
  if (isDistrict(id)) want.push(e.outline);
  else if (mode === "presentation") want.push(view.metric === "none" ? e.fill : e.outline, e.label);
  else if (mode === "audit") want.push(e.outline, e.label);
  else if (String(view.activeRegion) === id) want.push(e.outline);
  for (const g of want) g.addTo(map);
}

/** Bounds of the given regions' lots. */
export function regionBounds(ids) {
  const b = L.latLngBounds([]);
  for (const id of ids) for (const a of membersOf(id)) { const lyr = lotLayers[a]; if (lyr) b.extend(lyr.getBounds()); }
  return b;
}
/** Keep fitted shapes clear of the side panel on wide screens. */
function fitPadding() {
  const panel = document.querySelector(".panel");
  const wide = window.innerWidth > 760 && panel;
  return { paddingTopLeft: [wide ? panel.getBoundingClientRect().right + 16 : 16, 16], paddingBottomRight: [16, 16] };
}
export function fitRegions(ids) {
  const b = regionBounds(ids);
  if (b.isValid()) map.fitBounds(b, fitPadding());
}
export function resetView() {
  const d = districtId();
  const b = d ? regionBounds([d]) : null;
  if (b && b.isValid()) map.fitBounds(b, fitPadding()); else map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
}

// ---- popups / tooltips --------------------------------------------------------------------------------

export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function formatApn(apn) { return /^\d{8}$/.test(apn) ? `${apn.slice(0, 3)}-${apn.slice(3, 5)}-${apn.slice(5)}` : apn; }

export function lotSummary(apn) {
  const l = lots.get(apn);
  if (!l) return { title: `Lot ${formatApn(apn)}`, lines: [] };
  const t = lotTax(apn);
  const regions = regionsOf(apn).map((id) => (isDistrict(id) ? regionName(id) : `${displayNumber(id)}. ${regionName(id)}`));
  return {
    title: l.addr ? escapeHtml(l.addr) : `Lot ${formatApn(apn)}`,
    lines: [
      `<b>APN</b> ${formatApn(apn)}${l.use_desc || l.use ? ` · ${escapeHtml(l.use_desc || l.use)}` : ""}`,
      `<b>Lot</b> ${fmtSqft(l.sqft)}${l.year ? ` · built ${l.year}` : ""}${l.units ? ` · ${l.units} units` : ""}${l.zone ? ` · zoned ${escapeHtml(l.zone)}` : ""}`,
      `<b>Residents</b> ~${l.est.pop.toFixed(1)} · <b>homes</b> ~${l.est.hu.toFixed(1)} <span class="muted">(estimated from census block ${l.block ? l.block.slice(-4) : "—"})</span>`,
      `<b>Property tax</b> ${t.amount === null ? '<span class="muted">no tax data (import a tax roll)</span>' : `${fmtMoney(t.amount)} <span class="muted">${t.source === "roll" ? "tax roll" : "estimated from assessed value"}</span>`}`,
      `<b>In</b> ${regions.length ? regions.map(escapeHtml).join(", ") : '<span class="muted">no neighborhood</span>'}`,
    ],
  };
}
export function popupHtml(apn) {
  const s = lotSummary(apn);
  return `<div class="popup-title">${s.title}</div>${s.lines.map((x) => `<div>${x}</div>`).join("")}`;
}
function blockTooltip(id) {
  const b = blocks.get(id);
  if (!b) return id;
  return `<b>Census block ${id.slice(-4)}</b> (tract ${id.slice(5, 11)})<br>${fmtInt(b.pop)} people · ${fmtInt(b.hu)} homes · ${b.land_acres.toFixed(1)} ac<br>${b.land_acres > 0 ? (b.pop / b.land_acres).toFixed(1) : "—"} people/ac · ${b.occ > 0 ? fmtPct(b.rent / b.occ) : "—"} renters`;
}
