// Side-panel DOM: status line, coverage card, region list, comparison table, organizing details, lot info.
import { STATUSES } from "./config.js";
import { state, regionIds, regionName, regionColor, displayNumber, isHidden, setHidden, canUndo, canRedo, assignedCount, isDistrict, districtId, region, membersOf } from "./state.js";
import { regionStats, districtStats, cityStats, cumulativeStats, coverage, fmtInt, fmtPop, fmtAcres, fmtDensity, fmtPct, fmtMoney } from "./stats.js";
import { syncRegionVisibility, lotSummary, metricLegend, METRICS, view, escapeHtml } from "./render.js";
import { taxRollInfo } from "./units.js";

export const $ = (id) => document.getElementById(id);

export function setStatus(html, { error = false } = {}) {
  $("status").innerHTML = error ? `<span class="error">${html}</span>` : html;
}
export function workingCopyStatus() {
  return `${assignedCount().toLocaleString()} lots in the district or a neighborhood${state.dirty ? ' · <span class="dirty">unsaved changes</span> (Save browser or Export JSON)' : ""}.`;
}

// ---- region list -------------------------------------------------------------------------------------

let selected = null;
const onSelect = [];
export function selectedRegion() { return selected && state.regions[selected] ? selected : null; }
export function onRegionSelected(fn) { onSelect.push(fn); }
export function selectRegion(id) {
  selected = id ? String(id) : null;
  rebuildLegend();
  for (const fn of onSelect) fn(selected);
}

const STATUS_LABEL = { idea: "idea", forming: "forming", active: "active", dormant: "dormant" };

function legendRow(id) {
  const s = regionStats(id), r = region(id);
  const chip = isDistrict(id) ? '<span class="chip district">district</span>' : `<span class="chip s-${r.status}">${STATUS_LABEL[r.status]}</span>`;
  return `<span class="swatch${isDistrict(id) ? " dashed" : ""}" style="--c:${regionColor(id)}"></span>
    <input type="checkbox" id="r${id}" ${isHidden(id) ? "" : "checked"} title="Show on map">
    <button class="rname" data-id="${id}"><b>${isDistrict(id) ? "" : displayNumber(id) + ". "}${escapeHtml(regionName(id))}</b> ${chip}
      <span class="meta">${fmtPop(s.pop)} · ${fmtInt(s.hu)} homes · ${fmtAcres(s.acres)} · ${fmtDensity(s.density_acre)} · ${s.lots.toLocaleString()} lots</span>
    </button>`;
}

export function rebuildLegend() {
  const legend = $("legend");
  legend.innerHTML = "";
  const ids = regionIds();
  if (!ids.some((id) => !isDistrict(id))) {
    legend.insertAdjacentHTML("beforeend", `<div class="legend-empty">No neighborhoods yet. Switch to <b>Edit</b>, press <b>+ New</b>, then click lots or use <b>Select area</b>.</div>`);
  }
  for (const id of ids) {
    const row = document.createElement("div");
    row.className = "region" + (selected === id ? " selected" : "");
    row.innerHTML = legendRow(id);
    legend.appendChild(row);
    const cb = row.querySelector("input");
    cb.onchange = () => { setHidden(id, !cb.checked); syncRegionVisibility(id); updateCumulative(); };
    row.querySelector(".rname").onclick = () => selectRegion(selected === id ? null : id);
  }
  populateRegionSelect();
  updateCumulative();
  updateDetails();
}

export function populateRegionSelect() {
  const sel = $("activeRegion"), cur = sel.value;
  sel.innerHTML = regionIds().map((id) => `<option value="${id}">${isDistrict(id) ? "District: " : displayNumber(id) + ". "}${escapeHtml(regionName(id))}</option>`).join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else if (selectedRegion()) sel.value = selectedRegion();
  else { const first = regionIds().find((id) => !isDistrict(id)); if (first) sel.value = first; }
  updateEditorStats();
}

// ---- comparison table ------------------------------------------------------------------------------------

const ROWS = [
  ["Residents (est.)", (s) => fmtInt(s.pop)],
  ["Homes (housing units)", (s) => fmtInt(s.hu)],
  ["Households", (s) => fmtInt(s.occ)],
  ["Renter households", (s) => fmtPct(s.renter_share)],
  ["People per household", (s) => (Number.isFinite(s.hh_size) ? s.hh_size.toFixed(2) : "—")],
  ["Children (under 18)", (s) => (Number.isFinite(s.minors) && s.pop > 0 ? fmtPct(s.minors / s.pop) : "—")],
  ["Land (gross acres)", (s) => fmtAcres(s.acres)],
  ["Residents per acre", (s) => (Number.isFinite(s.density_acre) ? s.density_acre.toFixed(1) : "—")],
  ["Residents per sq mi", (s) => fmtInt(s.density_sqmi)],
  ["Homes per acre", (s) => (Number.isFinite(s.hu_acre) ? s.hu_acre.toFixed(1) : "—")],
  ["Lots", (s) => (s.lots === null ? "—" : fmtInt(s.lots))],
  ["Property tax", (s) => (s.has_tax ? fmtMoney(s.tax) + (s.tax_complete ? "" : "*") : "—")],
  ["Tax per resident", (s) => (s.tax_per_capita ? fmtMoney(s.tax_per_capita) : "—")],
  ["Tax per sq ft of lot", (s) => (s.tax_per_sqft ? "$" + s.tax_per_sqft.toFixed(2) : "—")],
];

export function comparisonTable(id, { compact = false } = {}) {
  const cols = [];
  if (id && !isDistrict(id)) cols.push([regionName(id), regionStats(id)]);
  const d = districtId();
  if (d) cols.push([regionName(d), districtStats()]);
  cols.push(["Gilroy", cityStats()]);
  const rows = compact ? ROWS.filter((r) => !/Children|sq mi|Lots/.test(r[0])) : ROWS;
  const partial = cols.some(([, s]) => s.has_tax && !s.tax_complete);
  return `<table class="cmp"><thead><tr><th></th>${cols.map(([n]) => `<th>${escapeHtml(n)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, f]) => `<tr><td>${label}</td>${cols.map(([, s]) => `<td>${f(s)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    ${partial ? '<div class="note">* Only lots found in the imported tax roll are counted; per-resident and per-sq-ft figures use those lots only.</div>' : ""}`;
}

// ---- details card ---------------------------------------------------------------------------------------

export function updateDetails() {
  const el = $("details");
  const id = selectedRegion() || districtId();
  if (!id) { el.innerHTML = "<div class='muted'>No district defined yet.</div>"; return; }
  const r = region(id);
  const s = regionStats(id);
  const meta = isDistrict(id) ? "" : `
    <div class="meta-grid">
      <label>Status<select data-k="status">${STATUSES.map((x) => `<option ${x === r.status ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label>Meets<input data-k="meets" value="${escapeHtml(r.meets)}" placeholder="e.g. 2nd Tuesday, 7pm"></label>
      <label>Coordinators <span class="private">private</span><input data-k="coordinators" value="${escapeHtml(r.coordinators)}" placeholder="names"></label>
      <label>Contact <span class="private">private</span><input data-k="contact" value="${escapeHtml(r.contact)}" placeholder="group chat, email list…"></label>
      <label class="wide">Notes: concerns, opportunities<textarea data-k="notes" rows="2">${escapeHtml(r.notes)}</textarea></label>
    </div>`;
  el.innerHTML = `<div class="details-head"><span class="swatch${isDistrict(id) ? " dashed" : ""}" style="--c:${regionColor(id)}"></span>
      <b>${isDistrict(id) ? "" : displayNumber(id) + ". "}${escapeHtml(regionName(id))}</b>
      <span class="muted">· ${s.lots.toLocaleString()} lots</span></div>
    ${meta}${comparisonTable(id)}`;
  for (const input of el.querySelectorAll("[data-k]")) {
    input.onchange = () => { for (const fn of metaHandlers) fn(id, { [input.dataset.k]: input.value }); };
  }
}
const metaHandlers = [];
export function onMetaChange(fn) { metaHandlers.push(fn); }

// ---- editor panel ---------------------------------------------------------------------------------------

export function updateEditorStats() {
  const id = $("activeRegion")?.value;
  const el = $("editorStats");
  if (!id || !state.regions[id]) { el.innerHTML = "Create a neighborhood with <b>+ New</b> to start."; return; }
  const s = regionStats(id);
  let delta = "";
  const base = state.baseline?.regions.find((r) => r.id === Number(id));
  if (base) {
    const d = membersOf(id).size - base.members.length;
    if (d) delta = ` · ${d > 0 ? "+" : ""}${d} lots vs. saved start`;
  } else delta = " · new";
  el.innerHTML = `<b>${isDistrict(id) ? "District" : displayNumber(id) + "."} ${escapeHtml(regionName(id))}</b><br>${fmtPop(s.pop)} · ${fmtInt(s.hu)} homes · ${fmtAcres(s.acres)} · ${fmtDensity(s.density_acre)} · ${s.lots} lots${delta}`;
}

export function showLotInfo(apn, note = "") {
  const s = lotSummary(apn);
  $("lotInfo").innerHTML = `<b>${s.title}</b><br>${s.lines.join("<br>")}${note ? `<br><span class="dirty">${note}</span>` : ""}`;
}

export function updateHistoryButtons() {
  $("undoBtn").disabled = !canUndo();
  $("redoBtn").disabled = !canRedo();
  $("resetEditsBtn").disabled = !state.dirty;
}

// ---- coverage / combined card ------------------------------------------------------------------------------

export function cumulativeHtml(exportMode = false) {
  const cov = coverage();
  const c = cumulativeStats();
  const covLine = cov
    ? `<div class="cov-bar"><span style="width:${Math.round(100 * (cov.pop_share || 0))}%"></span></div>
       <div class="cum-callout"><b>${fmtPct(cov.pop_share)}</b> of ${escapeHtml(regionName(districtId()))}'s estimated residents live in at least one neighborhood
       (${cov.covered_lots.toLocaleString()} of ${cov.district_lots.toLocaleString()} lots, ${cov.neighborhoods} neighborhood${cov.neighborhoods === 1 ? "" : "s"}).
       ${cov.outside_lots ? `${cov.outside_lots.toLocaleString()} neighborhood lot${cov.outside_lots === 1 ? " lies" : "s lie"} outside the district.` : ""}</div>`
    : "";
  const hood = c.ids.length
    ? `<div class="cum-grid">
        <div class="cum-item"><div class="v">${fmtInt(c.pop)}</div><div class="k">Residents in shown neighborhoods</div></div>
        <div class="cum-item"><div class="v">${fmtInt(c.hu)}</div><div class="k">Homes</div></div>
        <div class="cum-item"><div class="v">${fmtDensity(c.density_acre)}</div><div class="k">Combined density</div></div>
        <div class="cum-item"><div class="v">${c.overlap_lots.toLocaleString()}</div><div class="k">Lots in 2+ neighborhoods (counted once)</div></div>
      </div>`
    : "";
  const title = exportMode ? "cumtitle" : "cumulative-title";
  return `<div class="${title}">Organizing coverage</div>${covLine}${hood}`;
}
export function updateCumulative() { $("cumulativeStats").innerHTML = cumulativeHtml(false); }

// ---- metric legend -------------------------------------------------------------------------------------------

export function updateMetricLegend() {
  const items = metricLegend();
  const m = METRICS[view.metric];
  const blockNote = view.unit === "blocks" && m?.lot && !m.block ? '<div class="note">This measure is per lot. Switch to <b>Lots</b> to see it.</div>' : "";
  const estNote = ["density", "hu_acre", "pop"].includes(view.metric) && view.unit === "lots" ? '<div class="note">Lot values spread each census block\'s 2020 count over its residential lots. Treat single lots as rough; groups of lots are more reliable.</div>' : "";
  $("metricLegend").innerHTML = items.map((i) => `<span class="mkey"><span class="mswatch" style="background:${i.color}"></span>${escapeHtml(i.label)}</span>`).join("") + blockNote + estNote;
}

export function updateTaxStatus() {
  const info = taxRollInfo();
  $("taxStatus").innerHTML = info
    ? `Loaded <b>${escapeHtml(info.name)}</b> · ${info.parcels.toLocaleString()} parcels · columns used: ${Object.entries(info.columns).map(([k, v]) => `${k} = “${escapeHtml(v)}”`).join(", ")} · ${info.discarded_columns} other columns discarded. Stored only in this browser.`
    : "No tax roll loaded. Tax figures show “—” until you import one.";
  $("clearTaxBtn").disabled = !info;
}

// ---- mode UI --------------------------------------------------------------------------------------------------

const MODE_NOTES = {
  presentation: "Map view shows the district outline and each neighborhood. Click a lot for details; click a name in the list for its numbers.",
  audit: "Lots view shows the outlines of every neighborhood over the individual lots. Use the shading menu to color lots by a measure.",
  edit: "Edit: pick a neighborhood (or the district), then click lots to add or remove them, or use Select area. Lots can belong to several neighborhoods.",
};

export function setModeUI(mode) {
  for (const m of ["presentation", "audit", "edit"]) $(`${m}Btn`).classList.toggle("active", mode === m);
  $("editorSection").hidden = mode !== "edit";
  $("modeNote").textContent = MODE_NOTES[mode];
}
