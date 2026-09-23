// Side-panel DOM: status line, legend, cumulative card, editor stats, mode UI.
import { state, scopedRegionIds, regionName, regionColor, displayNumber, isHidden, setHidden, canUndo, canRedo, assignedCount } from "./state.js";
import { regionStats, statsForTracts, cumulativeStats, tractStats, fmtPop, fmtArea, fmtDensity, fmtInt, fmtPct, signed } from "./stats.js";
import { syncRegionVisibility, tractCode } from "./render.js";

export const $ = (id) => document.getElementById(id);

export function setStatus(html, { error = false } = {}) {
  $("status").innerHTML = error ? `<span class="error">${html}</span>` : html;
}
export function workingCopyStatus() {
  return `Editor working copy · ${assignedCount().toLocaleString()} assigned tracts${state.dirty ? ' · <span class="dirty">unsaved changes</span>' : ""}.`;
}

// ---- legend -------------------------------------------------------------------

function legendRow(id) {
  const s = regionStats(id);
  const pct = s.density ? Math.max(7, (100 * s.density) / 25000) : 7;
  return `<span class="swatch" style="background:${regionColor(id)}"></span>
    <input type="checkbox" id="r${id}" ${isHidden(id) ? "" : "checked"}>
    <label for="r${id}"><b>${displayNumber(id)}. ${regionName(id)}</b>
      <span class="meta">${fmtPop(s.population)} · ${fmtArea(s.land_sqmi)} · ${fmtDensity(s.density)} · ${s.tracts} tracts</span>
      <span class="densitybar"><span style="width:${Math.min(100, pct)}%;background:${regionColor(id)}"></span></span>
    </label>`;
}

export function rebuildLegend() {
  const legend = $("legend");
  legend.innerHTML = "";
  const ids = scopedRegionIds();
  if (!ids.length) legend.innerHTML = `<div class="legend-empty">No regions in this study area yet. Switch to <b>Edit regions</b>, create a region, and click tracts to build one.</div>`;
  for (const id of ids) {
    const row = document.createElement("div");
    row.className = "region";
    row.innerHTML = legendRow(id);
    legend.appendChild(row);
    const cb = row.querySelector("input");
    cb.onchange = () => { setHidden(id, !cb.checked); syncRegionVisibility(id); updateCumulative(); };
  }
  populateRegionSelect();
  updateCumulative();
}

export function populateRegionSelect() {
  const sel = $("activeRegion"), cur = sel.value;
  sel.innerHTML = '<option value="0">Unassigned (remove from region)</option>' +
    scopedRegionIds().map((id) => `<option value="${id}">${displayNumber(id)}. ${regionName(id)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  updateEditorStats();
}

// ---- editor panel ---------------------------------------------------------------

export function updateEditorStats() {
  const id = $("activeRegion")?.value;
  const el = $("editorStats");
  if (!id || id === "0") {
    el.innerHTML = "<b>Unassigned</b><br>Clicking a tract removes it from its current region but keeps it available on the map.";
    return;
  }
  const s = regionStats(id);
  let delta = "";
  const base = state.baseline?.regions.find((r) => r.id === Number(id));
  if (base && Number.isFinite(s.density)) {
    const b = statsForTracts(base.tracts);
    delta = `<br>vs. baseline: ${signed(s.tracts - b.tracts)} tracts · ${signed(s.population - b.population)} people · ${signed(s.land_sqmi - b.land_sqmi, 2)} sq mi · ${signed(s.density - (b.density || 0))}/sq mi`;
  } else if (!base) {
    delta = "<br>New region (not in the baseline).";
  }
  el.innerHTML = `<b>${displayNumber(id)}. ${regionName(id)}</b><br>${fmtPop(s.population)} · ${fmtArea(s.land_sqmi)} · ${fmtDensity(s.density)} · ${s.tracts} tracts${delta}`;
}

/** Tract hover/click readout. `move` = { from, to } region ids (0 = unassigned) after an edit. */
export function showTractInfo(geoid, move = null) {
  const s = tractStats(geoid), rid = state.assignment[geoid] || 0;
  const where = rid ? `Region ${displayNumber(rid)}: ${regionName(rid)}` : "Unassigned";
  const density = Number.isFinite(s.population) && s.land_sqmi > 0 ? ` · ${fmtInt(s.population / s.land_sqmi)}/sq mi` : "";
  const label = state.tractLabels[geoid] ? ` · ${state.tractLabels[geoid]}` : "";
  let moved = "";
  if (move) {
    const name = (r) => (r ? `Region ${displayNumber(r)}` : "Unassigned");
    moved = `<br>Moved from ${name(move.from)} → ${name(move.to)}.`;
  }
  $("tractInfo").innerHTML = `<b>Tract ${tractCode(geoid)}</b> · ${where}${label}<br>${fmtPop(s.population)} · ${fmtArea(s.land_sqmi)}${density}${moved}`;
}

export function updateHistoryButtons() {
  $("undoBtn").disabled = !canUndo();
  $("redoBtn").disabled = !canRedo();
  $("resetEditsBtn").disabled = !state.dirty;
}

// ---- cumulative card ---------------------------------------------------------------

export function cumulativeHtml(exportMode = false) {
  const s = cumulativeStats(), b = s.benchmark;
  const titleCls = exportMode ? "cumtitle" : "cumulative-title";
  if (!s.ids.length) return `<div class="${titleCls}">Highlighted regions combined</div><div>No regions highlighted.</div>`;
  const dens = s.density ? `${fmtInt(s.density)}/sq mi` : "pending";
  const mult = s.density_multiple ? `${s.density_multiple.toFixed(1)}×` : "—";
  if (exportMode) {
    return `<div class="cumtitle">Highlighted regions combined</div>
      <div class="cumgrid">
        <div><div class="cumv">${fmtPop(s.population)}</div><div class="cumk">Population · ${fmtPct(s.pop_share)} of ${b.name}</div></div>
        <div><div class="cumv">${fmtArea(s.land_sqmi)}</div><div class="cumk">Land · ${fmtPct(s.land_share)} of ${b.name}</div></div>
        <div><div class="cumv">${dens}</div><div class="cumk">Combined density</div></div>
        <div><div class="cumv">${mult}</div><div class="cumk">${b.name} density</div></div>
      </div>
      <div class="cumline"><b>${fmtPct(s.pop_share)}</b> of ${b.name}'s population lives on just <b>${fmtPct(s.land_share)}</b> of its land in the highlighted regions. ${s.tracts.toLocaleString()} census tracts are highlighted.</div>`;
  }
  return `<div class="cumulative-title">Highlighted regions combined</div>
    <div class="cum-grid">
      <div class="cum-item"><div class="v">${fmtPop(s.population)}</div><div class="k">Population · ${fmtPct(s.pop_share)} of ${b.name}</div></div>
      <div class="cum-item"><div class="v">${fmtArea(s.land_sqmi)}</div><div class="k">Land · ${fmtPct(s.land_share)} of ${b.name}</div></div>
      <div class="cum-item"><div class="v">${dens}</div><div class="k">Combined density</div></div>
      <div class="cum-item"><div class="v">${mult}</div><div class="k">${b.name} density</div></div>
    </div>
    <div class="cum-callout"><b>${fmtPct(s.pop_share)}</b> of ${b.name}'s population in only <b>${fmtPct(s.land_share)}</b> of its land · ${s.tracts.toLocaleString()} tracts.</div>
    <div class="county-note">Benchmark: ${b.name} · ${fmtInt(b.population)} people · ${b.land_sqmi.toFixed(2)} land sq mi · ${fmtInt(b.density)}/sq mi (2020 Census).</div>`;
}
export function updateCumulative() { $("cumulativeStats").innerHTML = cumulativeHtml(false); }

// ---- study area -----------------------------------------------------------------------------

/** Populate the area <select> from presets plus every individual county (grouped). */
export function renderAreaSelect(areas, counties, currentId) {
  const sel = $("areaSelect");
  const presets = areas.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  const single = counties.map((c) => `<option value="county:${c.fips}">${c.name} County</option>`).join("");
  sel.innerHTML = `<optgroup label="Presets">${presets}</optgroup><optgroup label="Single county">${single}</optgroup>`;
  sel.value = currentId;
}
export function setAreaStatus(text) { $("areaStatus").textContent = text; }

// ---- mode UI ---------------------------------------------------------------------------

const MODE_NOTES = {
  presentation: "Presentation mode dissolves each region's tracts into one shape. Uncheck a region to isolate the others; click a tract for details.",
  audit: "Audit mode shows individual tract boundaries from the same working assignments used by Presentation.",
  edit: "Editor mode: click tracts to assign or unassign them, create new regions, or delete regions. Changes are reversible and never modify the shipped baseline.",
};

export function setModeUI(mode) {
  for (const m of ["presentation", "audit", "edit"]) $(`${m}Btn`).classList.toggle("active", mode === m);
  $("editorSection").hidden = mode !== "edit";
  $("modeNote").textContent = MODE_NOTES[mode];
}
