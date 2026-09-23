// Editing actions: tract clicks, region CRUD, undo/redo, import/export wiring.
import { state, assignTract, createRegion, renameRegion, deleteRegion, undo, redo, resetToBaseline, regionName, displayNumber, applyRegionSet, assignedCount, scopedRegionIds, setHidden } from "./state.js";
import { reattachAllTracts, rebuildRegionGeometry, applyMode, popupHtml, setTractHandlers, syncRegionVisibility } from "./render.js";
import { $, rebuildLegend, updateEditorStats, updateHistoryButtons, showTractInfo, setStatus, workingCopyStatus, setModeUI } from "./ui.js";
import { downloadRegionSet, parseImport, saveBrowser, loadBrowser } from "./persist.js";

/** Full refresh after any change to regions or assignments. */
export function rebuildAfterEdit() {
  reattachAllTracts();
  rebuildRegionGeometry();
  rebuildLegend();
  updateEditorStats();
  updateHistoryButtons();
  setStatus(workingCopyStatus());
}

export function setMode(mode) {
  setModeUI(mode);
  applyMode(mode);
}

export function applyImportedSet(set, sourceLabel) {
  applyRegionSet(set);
  state.dirty = true;
  rebuildAfterEdit();
  setMode("edit");
  const dropped = set.dropped_unknown_tracts ? ` · ${set.dropped_unknown_tracts} unknown tract ids ignored` : "";
  setStatus(`${sourceLabel} · ${assignedCount().toLocaleString()} assigned tracts${dropped} · <span class="dirty">working copy</span>.`);
}

export function wireEditor() {
  setTractHandlers({
    hover: (geoid) => showTractInfo(geoid),
    click: (geoid, lyr) => {
      if (state.mode !== "edit") { lyr.bindPopup(popupHtml(geoid)).openPopup(); return; }
      const to = Number($("activeRegion").value) || 0;
      const from = assignTract(geoid, to);
      if (from === null) return;
      rebuildAfterEdit();
      showTractInfo(geoid, { from, to });
    },
  });

  $("activeRegion").onchange = updateEditorStats;

  $("newRegionBtn").onclick = () => {
    const row = $("newRegionRow");
    row.classList.toggle("open");
    if (row.classList.contains("open")) $("newRegionName").focus();
  };
  const create = () => {
    const name = $("newRegionName").value.trim();
    if (!name) return;
    const id = createRegion(name);
    rebuildLegend();
    $("activeRegion").value = String(id);
    $("newRegionName").value = "";
    $("newRegionRow").classList.remove("open");
    updateEditorStats();
    updateHistoryButtons();
    setStatus(workingCopyStatus());
  };
  $("createRegionBtn").onclick = create;
  $("newRegionName").onkeydown = (e) => { if (e.key === "Enter") create(); };

  $("renameBtn").onclick = () => {
    const id = $("activeRegion").value;
    if (!id || id === "0") return;
    const name = prompt("Region name:", regionName(id));
    if (!name || !name.trim()) return;
    renameRegion(id, name.trim());
    rebuildAfterEdit();
  };

  $("deleteRegionBtn").onclick = () => {
    const id = $("activeRegion").value;
    if (!id || id === "0") return;
    if (!confirm(`Delete Region ${displayNumber(id)} — ${regionName(id)}? Its tracts will become unassigned.`)) return;
    deleteRegion(id);
    rebuildAfterEdit();
  };

  $("undoBtn").onclick = () => { if (undo()) rebuildAfterEdit(); };
  $("redoBtn").onclick = () => { if (redo()) rebuildAfterEdit(); };
  $("resetEditsBtn").onclick = () => {
    if (!state.dirty || !confirm("Reset every edit back to the shipped baseline region set?")) return;
    resetToBaseline();
    rebuildAfterEdit();
  };

  $("exportBtn").onclick = downloadRegionSet;
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const set = await parseImport(JSON.parse(await f.text()));
      applyImportedSet(set, `Imported ${f.name}`);
    } catch (err) {
      alert("Could not import this file: " + err.message);
    }
  };
  $("saveBtn").onclick = () => {
    try { saveBrowser(); setStatus("Saved the current region set in this browser."); }
    catch (err) { alert("Browser save failed. Use Export JSON instead. " + err.message); }
  };
  $("loadBtn").onclick = async () => {
    try {
      const set = await loadBrowser();
      if (!set) { alert("No browser save was found for this map."); return; }
      applyImportedSet(set, "Loaded browser save");
    } catch (err) {
      alert("Could not load the browser save: " + err.message);
    }
  };
}

/** Toolbar: modes, show all, fit, reset view. */
export function wireToolbar({ fitRegions, resetView }) {
  $("presentationBtn").onclick = () => setMode("presentation");
  $("auditBtn").onclick = () => setMode("audit");
  $("editBtn").onclick = () => setMode("edit");
  $("allBtn").onclick = () => {
    for (const id of scopedRegionIds()) { setHidden(id, false); const cb = $(`r${id}`); if (cb) cb.checked = true; syncRegionVisibility(id); }
    rebuildLegend();
  };
  $("fitBtn").onclick = () => fitRegions();
  $("resetViewBtn").onclick = resetView;
}
