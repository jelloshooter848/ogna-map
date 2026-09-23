// Editing actions: lot clicks, area selection, region CRUD, undo/redo, import/export, tax-roll import.
import { state, toggleMember, setMembers, createRegion, updateRegion, deleteRegion, undo, redo, resetToBaseline, regionName, displayLabel, applyRegionSet, assignedCount, regionIds, setHidden, isDistrict } from "./state.js";
import { rebuildRegionGeometry, applyMode, popupHtml, setLotHandlers, syncRegionVisibility, restyleAllLots, view, setMetric, refreshMetric } from "./render.js";
import { $, rebuildLegend, updateEditorStats, updateHistoryButtons, showLotInfo, setStatus, workingCopyStatus, setModeUI, selectRegion, onRegionSelected, onMetaChange, updateMetricLegend, updateTaxStatus, updateCumulative, updateDetails } from "./ui.js";
import { downloadRegionSet, parseImport, saveBrowser, loadBrowser } from "./persist.js";
import { selectArea, isSelecting, cancelSelection } from "./lasso.js";
import { setTaxRoll, clearTaxRoll, lots } from "./units.js";
import { FIELDS, parseCsv, guessMapping, buildRoll, saveRoll, deleteRoll } from "./taxroll.js";
import { METRIC_STORAGE_KEY } from "./config.js";

/** Refresh after any change to regions or membership. */
export function rebuildAfterEdit() {
  view.activeRegion = $("activeRegion").value || null;
  syncColorInput();
  restyleAllLots();
  rebuildRegionGeometry();
  rebuildLegend();
  if (view.metric === "coverage") refreshMetric();
  updateEditorStats();
  updateHistoryButtons();
  setStatus(workingCopyStatus());
}

export function setMode(mode) {
  cancelSelection();
  setModeUI(mode);
  view.activeRegion = $("activeRegion").value || null;
  applyMode(mode);
}

export function applyImportedSet(set, sourceLabel) {
  applyRegionSet(set);
  state.dirty = true;
  rebuildAfterEdit();
  setMode("edit");
  const dropped = set.dropped_unknown_lots ? ` · ${set.dropped_unknown_lots} lot numbers not on this map were ignored` : "";
  setStatus(`${sourceLabel} · ${assignedCount().toLocaleString()} lots${dropped} · <span class="dirty">working copy</span>.`);
}

function activeId() { return $("activeRegion").value || null; }
function syncColorInput() { const id = activeId(); if (id && state.regions[id]) $("colorInput").value = state.regions[id].color; }

async function areaSelect(add) {
  const id = activeId();
  if (!id) { alert("Create or choose a neighborhood first."); return; }
  setStatus(`Click corners around the lots to ${add ? "add to" : "remove from"} <b>${regionName(id)}</b>. Double-click or click the first corner to finish; Esc cancels.`);
  const hits = await selectArea();
  if (!hits) { setStatus(workingCopyStatus()); return; }
  const n = setMembers(id, hits, add);
  rebuildAfterEdit();
  setStatus(`${n.toLocaleString()} lot${n === 1 ? "" : "s"} ${add ? "added to" : "removed from"} ${regionName(id)}. ${workingCopyStatus()}`);
}

export function wireEditor() {
  setLotHandlers({
    hover: (apn) => { if (state.mode === "edit") showLotInfo(apn); },
    click: (apn, lyr) => {
      if (isSelecting()) return;
      if (state.mode !== "edit") { lyr.bindPopup(popupHtml(apn), { maxWidth: 320 }).openPopup(); return; }
      const id = activeId();
      if (!id) return;
      const added = toggleMember(apn, id);
      rebuildAfterEdit();
      showLotInfo(apn, `${added ? "Added to" : "Removed from"} ${regionName(id)}.`);
    },
  });

  $("activeRegion").onchange = () => { view.activeRegion = activeId(); syncColorInput(); updateEditorStats(); restyleAllLots(); for (const id of regionIds()) syncRegionVisibility(id); };
  onRegionSelected((id) => {
    if (id && state.mode === "edit") { $("activeRegion").value = id; $("activeRegion").onchange(); }
  });
  onMetaChange((id, patch) => {
    updateRegion(id, patch);
    rebuildLegend();
    updateHistoryButtons();
    setStatus(workingCopyStatus());
  });

  $("newRegionBtn").onclick = () => {
    const row = $("newRegionRow");
    row.classList.toggle("open");
    if (row.classList.contains("open")) $("newRegionName").focus();
  };
  const create = () => {
    const name = $("newRegionName").value.trim();
    if (!name) return;
    const kind = $("newRegionKind").value;
    if (kind === "district" && regionIds().some(isDistrict) && !confirm("A district already exists. Create another one?")) return;
    const id = createRegion(name, kind);
    $("newRegionName").value = "";
    $("newRegionRow").classList.remove("open");
    rebuildLegend();
    $("activeRegion").value = String(id);
    selectRegion(String(id));
    rebuildAfterEdit();
  };
  $("createRegionBtn").onclick = create;
  $("newRegionName").onkeydown = (e) => { if (e.key === "Enter") create(); };

  $("selectAddBtn").onclick = () => areaSelect(true);
  $("selectRemoveBtn").onclick = () => areaSelect(false);

  $("renameBtn").onclick = () => {
    const id = activeId();
    if (!id) return;
    const name = prompt("Name:", regionName(id));
    if (!name || !name.trim()) return;
    updateRegion(id, { name: name.trim() });
    rebuildAfterEdit();
  };
  $("colorInput").onchange = (e) => { const id = activeId(); if (id) { updateRegion(id, { color: e.target.value }); rebuildAfterEdit(); } };

  $("deleteRegionBtn").onclick = () => {
    const id = activeId();
    if (!id) return;
    if (!confirm(`Delete ${displayLabel(id)}? Its lots stay on the map; only this boundary is removed.`)) return;
    deleteRegion(id);
    selectRegion(null);
    rebuildAfterEdit();
  };

  $("undoBtn").onclick = () => { if (undo()) rebuildAfterEdit(); };
  $("redoBtn").onclick = () => { if (redo()) rebuildAfterEdit(); };
  $("resetEditsBtn").onclick = () => {
    if (!state.dirty || !confirm("Reset every edit back to the region set this map started with?")) return;
    resetToBaseline();
    rebuildAfterEdit();
  };

  $("exportBtn").onclick = () => downloadRegionSet({ includePrivate: true });
  $("exportPublicBtn").onclick = () => downloadRegionSet({ includePrivate: false });
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { applyImportedSet(parseImport(JSON.parse(await f.text())), `Imported ${f.name}`); }
    catch (err) { alert("Could not import this file: " + err.message); }
  };
  $("saveBtn").onclick = () => {
    try { saveBrowser(); setStatus("Saved in this browser (including private contact details)."); }
    catch (err) { alert("Browser save failed. Use Export JSON instead. " + err.message); }
  };
  $("loadBtn").onclick = () => {
    try {
      const set = loadBrowser();
      if (!set) { alert("No browser save was found."); return; }
      applyImportedSet(set, "Loaded browser save");
    } catch (err) { alert("Could not load the browser save: " + err.message); }
  };
}

/** Toolbar: modes, show all, fit, reset view; shading controls. */
export function wireToolbar({ fitRegions, resetView }) {
  $("presentationBtn").onclick = () => setMode("presentation");
  $("auditBtn").onclick = () => setMode("audit");
  $("editBtn").onclick = () => setMode("edit");
  $("allBtn").onclick = () => {
    for (const id of regionIds()) { setHidden(id, false); syncRegionVisibility(id); }
    rebuildLegend();
  };
  $("fitBtn").onclick = () => fitRegions();
  $("resetViewBtn").onclick = resetView;

  const applyShading = () => {
    setMetric($("metricSelect").value, $("unitBlocks").checked ? "blocks" : "lots");
    for (const id of regionIds()) syncRegionVisibility(id);
    updateMetricLegend();
    try { localStorage.setItem(METRIC_STORAGE_KEY, JSON.stringify({ metric: view.metric, unit: view.unit })); } catch { /* ignore */ }
  };
  $("metricSelect").onchange = applyShading;
  $("unitLots").onchange = applyShading;
  $("unitBlocks").onchange = applyShading;
  try {
    const saved = JSON.parse(localStorage.getItem(METRIC_STORAGE_KEY) || "null");
    if (saved) { $("metricSelect").value = saved.metric; (saved.unit === "blocks" ? $("unitBlocks") : $("unitLots")).checked = true; }
  } catch { /* ignore */ }
  return applyShading;
}

// ---- tax roll import ----------------------------------------------------------------------------------------

export function wireTaxImport() {
  let parsed = null, fileName = "";
  $("taxImportBtn").onclick = () => $("taxFile").click();
  $("taxFile").onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { alert("Save the spreadsheet as CSV (File → Save As → CSV) and import that."); return; }
    try {
      parsed = parseCsv(await f.text());
      fileName = f.name;
      if (!parsed.rows.length) throw new Error("the file has a header but no rows");
    } catch (err) { alert("Could not read this file: " + err.message); return; }
    const guess = guessMapping(parsed.header);
    const opts = (sel) => `<option value="-1">(none)</option>` + parsed.header.map((h, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${h.replace(/</g, "&lt;")}</option>`).join("");
    $("taxMapping").innerHTML = `<div class="note">${parsed.rows.length.toLocaleString()} rows in ${fileName.replace(/</g, "&lt;")}. Match the columns; everything else (owner names, addresses) is discarded.</div>` +
      FIELDS.map((fd) => `<label>${fd.label}<select data-f="${fd.key}">${opts(guess[fd.key])}</select></label>`).join("") +
      `<div class="export-actions"><button id="taxApplyBtn">Use these columns</button><button id="taxCancelBtn">Cancel</button></div>`;
    $("taxMapping").hidden = false;
    $("taxCancelBtn").onclick = () => { parsed = null; $("taxMapping").hidden = true; };
    $("taxApplyBtn").onclick = async () => {
      const mapping = {};
      for (const s of $("taxMapping").querySelectorAll("select")) mapping[s.dataset.f] = Number(s.value);
      try {
        const { roll, meta } = buildRoll(parsed, mapping, fileName);
        const matched = [...roll.keys()].filter((a) => lots.has(a)).length;
        meta.matched = matched;
        if (!matched && !confirm(`None of the ${roll.size.toLocaleString()} APNs match lots on this map. Keep it anyway?`)) return;
        setTaxRoll(roll, meta);
        await saveRoll(roll, meta).catch((err) => console.warn("could not store tax roll", err));
        parsed = null;
        $("taxMapping").hidden = true;
        afterTaxChange();
        setStatus(`Tax roll loaded: ${matched.toLocaleString()} of ${lots.size.toLocaleString()} lots on the map matched.`);
      } catch (err) { alert(err.message); }
    };
  };
  $("clearTaxBtn").onclick = async () => {
    if (!confirm("Remove the imported tax roll from this browser?")) return;
    clearTaxRoll();
    await deleteRoll();
    afterTaxChange();
  };
}

export function afterTaxChange() {
  updateTaxStatus();
  refreshMetric();
  updateMetricLegend();
  rebuildRegionGeometry();
  updateCumulative();
  updateDetails();
  rebuildLegend();
}
