// PNG export composer: off-screen Leaflet map at a chosen size/bounds, legend card, combined image.
import { TILE_URL, TILE_ATTRIBUTION } from "./config.js";
import { state, visibleRegionIds, regionColor, regionName, displayNumber } from "./state.js";
import { regionStats, benchmark, fmtPop, fmtArea, fmtDensity } from "./stats.js";
import { map, dissolveRegion, labelPoint, labelIcon, regionBounds } from "./render.js";
import { $, cumulativeHtml, setStatus } from "./ui.js";
import { addTransitToExport } from "./transit.js";

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
  const b = regionBounds(visibleRegionIds());
  if (!b.isValid()) throw new Error("No highlighted region geometry is available.");
  return b;
}

function exportBounds() {
  const type = $("exportExtent").value;
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
  const scale = +$("exportLabelScale").value || 1;
  for (const id of visibleRegionIds()) {
    const { fts, display } = dissolveRegion(id);
    if (!fts.length) continue;
    for (const ft of display) {
      L.geoJSON(ft, { style: { color: regionColor(id), weight: 3, opacity: 1, fillColor: regionColor(id), fillOpacity: 0.66 }, interactive: false }).addTo(em);
    }
    const pt = labelPoint(display, fts);
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
    addTransitToExport(em);
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
  const b = benchmark();
  const rows = visibleRegionIds().map((id) => {
    const st = regionStats(id);
    return `<div class="erow"><span class="eswatch" style="background:${regionColor(id)}"></span><div>
      <div class="ename">${displayNumber(id)}. ${regionName(id)}</div>
      <div class="emeta">${fmtPop(st.population)} · ${fmtArea(st.land_sqmi)} · ${fmtDensity(st.density)} · ${st.tracts} tracts</div></div></div>`;
  }).join("");
  card.innerHTML = `<h2>${state.setName}</h2>
    <div class="subtitle">${b.name} · population · land area · density · tract count</div>
    <div class="cumexport">${cumulativeHtml(true)}</div>${rows}
    <div class="efoot">Whole 2020 Census tracts. Population and land area: 2020 Census. Unassigned tracts are omitted. Benchmark: ${b.name} 2020 Census totals.</div>`;
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
  for (const id of ["exportMapPngBtn", "exportLegendPngBtn", "exportBothPngBtn"]) $(id).disabled = on;
  if (on) setStatus("Rendering high-resolution PNG…");
}

const slug = () => (state.setName || "regions").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

async function run(label, fn) {
  setBusy(true);
  try { await fn(); setStatus("PNG export finished."); }
  catch (e) { alert(`Could not export the ${label}: ${e.message}`); setStatus(`Export failed: ${e.message}`, { error: true }); }
  finally { setBusy(false); }
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
  $("exportBothPngBtn").onclick = () => run("combined PNG", async () => {
    const legend = await captureLegend();
    const type = $("exportExtent").value;
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
    downloadCanvas(c, `${slug()}_map_and_legend.png`);
  });
}
