// Working state: regions, tract assignment, undo/redo. No DOM, no Leaflet.
import { FORMAT_VERSION, HISTORY_LIMIT, PALETTE } from "./config.js";

export const state = {
  setName: "Region set",
  description: "",
  defaultArea: "la",
  regions: {},       // id (string) -> { id: number, name, color }
  assignment: {},    // geoid (11-digit) -> region id (number)
  tractLabels: {},   // geoid -> optional descriptive label
  hidden: new Set(), // region ids (string) unchecked in the legend
  areaId: null,      // current study area id; regions are listed only if they touch its counties
  areaCounties: null,// 5-digit FIPS list for the current study area (null = no scoping)
  mode: "presentation",
  history: [],
  redo: [],
  dirty: false,
  baseline: null,    // region set loaded at startup; "Reset edits" returns here
};

const clone = (x) => JSON.parse(JSON.stringify(x));
let membersCache = null;
const touch = () => { membersCache = null; scopeCache = null; };

// ---- lookups ---------------------------------------------------------------

export function regionIds() {
  return Object.keys(state.regions).sort((a, b) => +a - +b);
}
export function regionName(id) { return state.regions[String(id)]?.name || `Region ${id}`; }
export function regionColor(id) { return state.regions[String(id)]?.color || "#4a5568"; }
export function displayNumber(id) {
  const i = scopedRegionIds().indexOf(String(id));
  return i >= 0 ? i + 1 : id;
}
export function displayLabel(id) { return `${displayNumber(id)}. ${regionName(id)}`; }

/** region id (string) -> array of geoids; cached until the next mutation. */
export function membersByRegion() {
  if (!membersCache) {
    membersCache = {};
    for (const id of regionIds()) membersCache[id] = [];
    for (const [geoid, rid] of Object.entries(state.assignment)) {
      (membersCache[String(rid)] ||= []).push(geoid);
    }
  }
  return membersCache;
}
export function tractsOf(id) { return membersByRegion()[String(id)] || []; }
export function isHidden(id) { return state.hidden.has(String(id)); }
export function setHidden(id, hidden) { hidden ? state.hidden.add(String(id)) : state.hidden.delete(String(id)); }

/** Restrict listings to regions touching these counties (null = show everything). */
export function setAreaScope(areaId, counties) {
  state.areaId = areaId;
  state.areaCounties = counties ? new Set(counties) : null;
  scopeCache = null;
}
let scopeCache = null;
/** A region is in scope if any of its tracts lies in the area, or it is empty and was created here. */
export function regionInArea(id) {
  if (!state.areaCounties) return true;
  const r = state.regions[String(id)];
  const tracts = tractsOf(id);
  if (!tracts.length) return !r?.area || r.area === state.areaId;
  return tracts.some((g) => state.areaCounties.has(g.slice(0, 5)));
}
/** Region ids listed in the current study area, sorted numerically. */
export function scopedRegionIds() {
  if (!scopeCache) scopeCache = regionIds().filter(regionInArea);
  return scopeCache;
}
export function visibleRegionIds() {
  return scopedRegionIds().filter((id) => !isHidden(id) && tractsOf(id).length > 0);
}
export function assignedCount() { return Object.keys(state.assignment).length; }

// ---- region-set (de)serialisation -----------------------------------------

export function applyRegionSet(set, { asBaseline = false } = {}) {
  state.setName = set.name || "Region set";
  state.description = set.description || "";
  state.defaultArea = set.default_area || "la";
  state.regions = {};
  state.assignment = {};
  state.tractLabels = { ...(set.tract_labels || {}) };
  for (const r of set.regions || []) {
    const id = Number(r.id);
    state.regions[String(id)] = { id, name: r.name || `Region ${id}`, color: r.color || nextColor(), ...(r.area ? { area: r.area } : {}) };
    for (const g of r.tracts || []) state.assignment[String(g)] = id;
  }
  state.hidden = new Set();
  state.history = [];
  state.redo = [];
  state.dirty = false;
  touch();
  if (asBaseline) state.baseline = toRegionSet();
}

export function toRegionSet() {
  const members = membersByRegion();
  const regions = regionIds().map((id) => ({
    id: Number(id),
    name: state.regions[id].name,
    color: state.regions[id].color,
    ...(state.regions[id].area ? { area: state.regions[id].area } : {}),
    tracts: [...(members[id] || [])].sort(),
  }));
  const tract_labels = {};
  for (const g of Object.keys(state.tractLabels).sort()) {
    if (state.assignment[g] !== undefined) tract_labels[g] = state.tractLabels[g];
  }
  return {
    format_version: FORMAT_VERSION,
    name: state.setName,
    description: state.description,
    default_area: state.defaultArea,
    regions,
    tract_labels,
  };
}

// ---- history -----------------------------------------------------------------

function snapshot() {
  return { regions: clone(state.regions), assignment: clone(state.assignment), tractLabels: clone(state.tractLabels) };
}
function restore(s) {
  state.regions = clone(s.regions);
  state.assignment = clone(s.assignment);
  state.tractLabels = clone(s.tractLabels);
  touch();
}
export function pushHistory() {
  state.history.push(snapshot());
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  state.redo = [];
}
export function canUndo() { return state.history.length > 0; }
export function canRedo() { return state.redo.length > 0; }
export function undo() {
  if (!canUndo()) return false;
  state.redo.push(snapshot());
  restore(state.history.pop());
  state.dirty = !matchesBaseline();
  return true;
}
export function redo() {
  if (!canRedo()) return false;
  state.history.push(snapshot());
  restore(state.redo.pop());
  state.dirty = !matchesBaseline();
  return true;
}
export function matchesBaseline() {
  if (!state.baseline) return false;
  const a = toRegionSet(), b = state.baseline;
  return JSON.stringify(a.regions) === JSON.stringify(b.regions);
}

// ---- mutations (each records history and marks the set dirty) -----------------

export function nextColor() {
  const used = new Set(Object.values(state.regions).map((r) => r.color));
  return PALETTE.find((c) => !used.has(c)) || PALETTE[Object.keys(state.regions).length % PALETTE.length];
}

/** Assign a tract to region `rid` (0 = unassigned). Returns the previous region id, or null if no change. */
export function assignTract(geoid, rid) {
  const old = state.assignment[geoid] || 0;
  rid = Number(rid) || 0;
  if (old === rid) return null;
  pushHistory();
  if (rid === 0) delete state.assignment[geoid];
  else state.assignment[geoid] = rid;
  state.dirty = true;
  touch();
  return old;
}

export function createRegion(name) {
  pushHistory();
  const id = Math.max(0, ...Object.keys(state.regions).map(Number)) + 1;
  state.regions[String(id)] = { id, name, color: nextColor(), ...(state.areaId ? { area: state.areaId } : {}) };
  state.dirty = true;
  touch();
  return id;
}

export function renameRegion(id, name) {
  if (!state.regions[String(id)]) return;
  pushHistory();
  state.regions[String(id)].name = name;
  state.dirty = true;
}

export function deleteRegion(id) {
  id = String(id);
  if (!state.regions[id]) return;
  pushHistory();
  for (const g of tractsOf(id)) delete state.assignment[g];
  delete state.regions[id];
  state.hidden.delete(id);
  state.dirty = true;
  touch();
}

/** Return to the region set loaded at startup, keeping undo history. */
export function resetToBaseline() {
  if (!state.baseline) return;
  pushHistory();
  const keep = { history: state.history, redo: [] };
  applyRegionSet(state.baseline);
  state.history = keep.history;
  state.redo = keep.redo;
  state.dirty = false;
}
