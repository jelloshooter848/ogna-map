// PNG export composer: off-screen Leaflet map at a chosen size/bounds, legend card, combined image.
import { TILE_URL, TILE_ATTRIBUTION } from "./config.js";
import { state, visibleRegionIds, regionColor, regionName, displayNumber, isDistrict, districtId, region } from "./state.js";
import { regionStats, fmtPop, fmtInt, fmtAcres, fmtDensity } from "./stats.js";
import { map, dissolveRegion, labelPoint, labelIcon, regionBounds, escapeHtml } from "./render.js";
import { $, cumulativeHtml, setStatus, selectedRegion, comparisonTable } from "./ui.js";

// A "sheet" export shows one neighborhood (plus the district outline) with its numbers: the starter-kit map.
let sheetId = null;
const exportRegionIds = () => (sheetId ? [districtId(), sheetId].filter(Boolean) : visibleRegionIds());

// ---- inputs -------------------------------------------------------------------------

function setCustomBoundsInputs(b) {
  if (!b || !b.isValid()) return;
  $("exportNorth").value = b.getNorth().toFixed(5);
  $("exportSouth").value = b.getSouth().toFixed(5);
  $("exportWest").value = b.getWest().toFixed(5);
  $("exportEast").value = b.getEast().toFixed(5);
}

function customBounds() {
  const n = +$("exportNorth").value, s = +$("exportSouth").value, w = +$("exportWest").value, e = +$("exportEast").value;
  if (![n, s, w, e].every(Number.isFinite) || n <= s || e <= w) throw new Error("Custom bounds are incomplete or invalid.");
  return L.latLngBounds([s, w], [n, e]);
}

function highlightedBounds() {
  const b = regionBounds(sheetId ? [sheetId] : visibleRegionIds().filter((id) => !isDistrict(id) || visibleRegionIds().length === 1));
  if (!b.isValid()) throw new Error("No highlighted region geometry is available.");
  return b;
}

function exportBounds() {
  const type = sheetId ? "highlighted" : $("exportExtent").value;
  if (type === "current") return map.getBounds();
  if (type === "custom") return customBounds();
  return highlightedBounds().pad(+$("exportPadding").value || 0);
}

function exportDimensions() {
  const w = +$("exportWidth").value, h = +$("exportHeight").value;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 800 || h < 600 || w > 8000 || h > 8000) {
    throw new Error("Export dimensions must be between 800×600 and 8000×8000 pixels.");
  }
  return { w: Math.round(w), h: Math.round(h) };
}

// ---- rendering -----------------------------------------------------------------------

function addExportRegions(em) {
  // Labels are sized in CSS pixels; scale them with the output so they stay readable on large images.
  const size = em.getSize();
  const scale = (+$("exportLabelScale").value || 1) * Math.max(1, Math.min(3, Math.max(size.x, size.y) / 700));
  for (const id of exportRegionIds()) {
    const { display } = dissolveRegion(id);
    if (!display.length) continue;
    const c = regionColor(id);
    const style = isDistrict(id)
      ? { color: c, weight: 4, opacity: 0.9, dashArray: "12 8", fill: false }
      : { color: c, weight: 3.5, opacity: 1, fillColor: c, fillOpacity: sheetId ? 0.18 : 0.26 };
    for (const ft of display) L.geoJSON(ft, { style, interactive: false }).addTo(em);
    if (isDistrict(id)) continue;
    const pt = labelPoint(display);
    if (pt) L.marker(pt, { icon: labelIcon(id, scale), interactive: false }).addTo(em);
  }
}

function waitForTiles(tileLayer, timeout = 25000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    tileLayer.once("load", () => setTimeout(finish, 350));
    setTimeout(finish, timeout);
  });
}

async function captureMap(w, h, bounds) {
  if (!window.html2canvas) throw new Error("PNG export library did not load.");
  const host = document.createElement("div");
  host.className = "export-offscreen";
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  document.body.appendChild(host);
  let em = null;
  try {
    em = L.map(host, { preferCanvas: true, zoomControl: false, attributionControl: true, fadeAnimation: false, zoomAnimation: false });
    const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION, opacity: 0.78, crossOrigin: true }).addTo(em);
    em.fitBounds(bounds, { animate: false, padding: [0, 0] });
    em.invalidateSize(false);
    addExportRegions(em);
    await waitForTiles(tiles);
    await new Promise((r) => setTimeout(r, 450));
    return await html2canvas(host, { scale: 1, useCORS: true, allowTaint: false, backgroundColor: "#edf1f3", logging: false, imageTimeout: 30000, width: w, height: h });
  } finally {
    if (em) em.remove();
    host.remove();
  }
}

function buildLegendCard() {
  const card = document.createElement("div");
  card.className = "export-card";
  if (sheetId) {
    const r = region(sheetId);
    card.innerHTML = `<h2>${escapeHtml(regionName(sheetId))}</h2>
      <div class="subtitle">A neighborhood of ${escapeHtml(state.setName)}${r.meets ? ` · meets ${escapeHtml(r.meets)}` : ""}</div>
      ${comparisonTable(sheetId, { compact: true })}
      ${r.notes ? `<div class="enotes"><b>Notes</b><br>${escapeHtml(r.notes)}</div>` : ""}
      <div class="efoot">Residents and homes are estimates: 2020 Census block counts spread over each block's residential lots. Land is gross acres (streets included).</div>`;
    document.body.appendChild(card);
    return card;
  }
  const rows = visibleRegionIds().filter((id) => !isDistrict(id)).map((id) => {
    const st = regionStats(id);
    return `<div class="erow"><span class="eswatch" style="background:${regionColor(id)}"></span><div>
      <div class="ename">${displayNumber(id)}. ${escapeHtml(regionName(id))}</div>
      <div class="emeta">${fmtPop(st.pop)} · ${fmtInt(st.hu)} homes · ${fmtAcres(st.acres)} · ${fmtDensity(st.density_acre)}</div></div></div>`;
  }).join("");
  card.innerHTML = `<h2>${escapeHtml(state.setName)}</h2>
    <div class="subtitle">Neighborhoods · estimated residents · homes · land · density</div>
    <div class="cumexport">${cumulativeHtml(true)}</div>${rows}
    <div class="efoot">Residents and homes are estimates from 2020 Census blocks spread over residential lots. Land is gross acres (streets included). Neighborhoods may overlap; combined figures count each lot once.</div>`;
  document.body.appendChild(card);
  return card;
}

async function captureLegend() {
  if (!window.html2canvas) throw new Error("PNG export library did not load.");
  const card = buildLegendCard();
  try { return await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false }); }
  finally { card.remove(); }
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) { alert("PNG export failed. If the basemap did not permit capture, try again after the map finishes loading."); return; }
    const a = document.createElement("a"), u = URL.createObjectURL(blob);
    a.href = u; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
  }, "image/png", 1);
}

function mercatorAspect(bounds) {
  const w = Math.abs(bounds.getEast() - bounds.getWest());
  const lat2y = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
  const h = (Math.abs(lat2y(bounds.getNorth()) - lat2y(bounds.getSouth())) * 180) / Math.PI;
  return h > 0 ? w / h : 1;
}

function combinedMapDimensions(legendCanvas, bounds) {
  const layout = $("combinedLayout")?.value || "compact";
  const mult = layout === "wide" ? 1.32 : layout === "balanced" ? 1.12 : 0.96;
  const h = Math.max(1400, Math.min(3600, legendCanvas.height));
  const minAspect = layout === "wide" ? 1.05 : 0.72, maxAspect = layout === "wide" ? 1.75 : 1.35;
  const aspect = Math.max(minAspect, Math.min(maxAspect, mercatorAspect(bounds) * mult));
  return { w: Math.round(h * aspect), h };
}

function setBusy(on) {
  for (const id of ["exportMapPngBtn", "exportLegendPngBtn", "exportBothPngBtn", "exportSheetBtn"]) $(id).disabled = on;
  if (on) setStatus("Rendering high-resolution PNG…");
}

const slug = () => (state.setName || "regions").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

async function run(label, fn, sheet = null) {
  setBusy(true);
  sheetId = sheet;
  try { await fn(); setStatus("PNG export finished."); }
  catch (e) { alert(`Could not export the ${label}: ${e.message}`); setStatus(`Export failed: ${e.message}`, { error: true }); }
  finally { setBusy(false); sheetId = null; }
}

async function combined(filename) {
  const legend = await captureLegend();
  const type = sheetId ? "highlighted" : $("exportExtent").value;
  const bounds = type === "custom" ? customBounds() : type === "current" ? map.getBounds() : highlightedBounds().pad(+$("exportPadding").value || 0);
  const md = combinedMapDimensions(legend, bounds);
  const m = await captureMap(md.w, md.h, bounds);
  const gap = 22, w = legend.width + gap + m.width, h = Math.max(legend.height, m.height);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h);
  x.drawImage(legend, 0, Math.round((h - legend.height) / 2));
  x.drawImage(m, legend.width + gap, Math.round((h - m.height) / 2));
  downloadCanvas(c, filename);
}

export function wireExport() {
  $("exportSize").onchange = (e) => {
    if (e.target.value === "custom") return;
    const [w, h] = e.target.value.split("x");
    $("exportWidth").value = w; $("exportHeight").value = h;
  };
  $("useCurrentBoundsBtn").onclick = () => { setCustomBoundsInputs(map.getBounds()); $("exportExtent").value = "custom"; };
  $("useHighlightedBoundsBtn").onclick = () => {
    try { setCustomBoundsInputs(highlightedBounds()); $("exportExtent").value = "custom"; } catch (e) { alert(e.message); }
  };

  $("exportMapPngBtn").onclick = () => run("map PNG", async () => {
    const { w, h } = exportDimensions();
    downloadCanvas(await captureMap(w, h, exportBounds()), `${slug()}_map.png`);
  });
  $("exportLegendPngBtn").onclick = () => run("legend PNG", async () => {
    downloadCanvas(await captureLegend(), `${slug()}_legend.png`);
  });
  $("exportBothPngBtn").onclick = () => run("combined PNG", () => combined(`${slug()}_map_and_legend.png`));
  $("exportSheetBtn").onclick = () => {
    const id = selectedRegion();
    if (!id || isDistrict(id)) { alert("Click a neighborhood's name in the list first."); return; }
    run("neighborhood sheet", () => combined(`${slug()}_${regionName(id).toLowerCase().replace(/[^a-z0-9]+/g, "_")}_sheet.png`), id);
  };
}
