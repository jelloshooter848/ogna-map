// Working state: the district, overlapping neighborhoods, undo/redo. No DOM, no Leaflet.
// A region owns a Set of lot APNs; a lot may belong to any number of regions.
import { FORMAT_VERSION, HISTORY_LIMIT, PALETTE, DISTRICT_COLOR, STATUSES } from "./config.js";

export const state = {
  setName: "Oldtown Gilroy",
  description: "",
  regions: {},       // id (string) -> { id, name, color, kind: "district"|"neighborhood", status, coordinators, contact, meets, notes, members: Set<apn> }
  hidden: new Set(), // region ids (string) unchecked in the legend
  mode: "presentation",
  history: [],
  redo: [],
  dirty: false,
  baseline: null,    // region set loaded at startup; "Reset edits" returns here
};

const META = ["status", "coordinators", "contact", "meets", "notes"];
const PRIVATE_META = ["coordinators", "contact"];
let reverseCache = null;
const touch = () => { reverseCache = null; version++; };
let version = 0;
/** Increments on every membership change; used by caches elsewhere. */
export const stateVersion = () => version;

// ---- lookups ---------------------------------------------------------------------------------------

/** District(s) first, then neighborhoods in id order. */
export function regionIds() {
  return Object.keys(state.regions).sort((a, b) => {
    const da = state.regions[a].kind === "district" ? 0 : 1, db = state.regions[b].kind === "district" ? 0 : 1;
    return da - db || +a - +b;
  });
}
export const scopedRegionIds = regionIds;
export function neighborhoodIds() { return regionIds().filter((id) => state.regions[id].kind !== "district"); }
export function districtId() { return regionIds().find((id) => state.regions[id].kind === "district") || null; }
export function isDistrict(id) { return state.regions[String(id)]?.kind === "district"; }
export function region(id) { return state.regions[String(id)] || null; }
export function regionName(id) { return state.regions[String(id)]?.name || `Neighborhood ${id}`; }
export function regionColor(id) { return state.regions[String(id)]?.color || "#4a5568"; }
export function displayNumber(id) {
  if (isDistrict(id)) return "";
  const i = neighborhoodIds().indexOf(String(id));
  return i >= 0 ? i + 1 : id;
}
export function displayLabel(id) { return isDistrict(id) ? regionName(id) : `${displayNumber(id)}. ${regionName(id)}`; }

export function membersOf(id) { return state.regions[String(id)]?.members || new Set(); }
/** Array form, for callers that iterate or map. */
export function tractsOf(id) { return [...membersOf(id)]; }

/** apn -> region ids (strings) containing it; cached until the next membership change. */
export function regionsOf(apn) {
  if (!reverseCache) {
    reverseCache = new Map();
    for (const id of regionIds()) for (const a of state.regions[id].members) {
      const list = reverseCache.get(a);
      if (list) list.push(id); else reverseCache.set(a, [id]);
    }
  }
  return reverseCache.get(apn) || [];
}
/** Number of neighborhoods (not the district) containing a lot. */
export function neighborhoodCount(apn) { return regionsOf(apn).filter((id) => !isDistrict(id)).length; }

export function isHidden(id) { return state.hidden.has(String(id)); }
export function setHidden(id, hidden) { hidden ? state.hidden.add(String(id)) : state.hidden.delete(String(id)); }
export function visibleRegionIds() { return regionIds().filter((id) => !isHidden(id) && membersOf(id).size > 0); }
export function assignedCount() {
  const all = new Set();
  for (const id of regionIds()) for (const a of state.regions[id].members) all.add(a);
  return all.size;
}

// ---- region-set (de)serialisation --------------------------------------------------------------

function normaliseRegion(r) {
  const id = Number(r.id);
  const kind = r.kind === "district" ? "district" : "neighborhood";
  return {
    id, kind,
    name: String(r.name || (kind === "district" ? "District" : `Neighborhood ${id}`)),
    color: r.color || (kind === "district" ? DISTRICT_COLOR : nextColor()),
    status: STATUSES.includes(r.status) ? r.status : (kind === "district" ? "active" : "idea"),
    coordinators: r.coordinators || "", contact: r.contact || "", meets: r.meets || "", notes: r.notes || "",
    members: new Set((r.members || []).map(String)),
    ...(r.seed_polygon ? { seed_polygon: r.seed_polygon } : {}),
  };
}

export function applyRegionSet(set, { asBaseline = false } = {}) {
  state.setName = set.name || "Oldtown Gilroy";
  state.description = set.description || "";
  state.regions = {};
  for (const r of set.regions || []) state.regions[String(Number(r.id))] = normaliseRegion(r);
  state.hidden = new Set();
  state.history = [];
  state.redo = [];
  state.dirty = false;
  touch();
  if (asBaseline) state.baseline = toRegionSet();
}

/** Serialisable region set. `includePrivate: false` drops coordinator names and contact details. */
export function toRegionSet({ includePrivate = true } = {}) {
  const regions = regionIds().map((id) => {
    const r = state.regions[id];
    const meta = {};
    for (const k of META) if (r[k] && (includePrivate || !PRIVATE_META.includes(k))) meta[k] = r[k];
    return { id: r.id, kind: r.kind, name: r.name, color: r.color, ...meta, members: [...r.members].sort() };
  });
  return { format_version: FORMAT_VERSION, units: "apn", name: state.setName, description: state.description, regions };
}

// ---- history ----------------------------------------------------------------------------------------

function snapshot() {
  const regions = {};
  for (const [id, r] of Object.entries(state.regions)) regions[id] = { ...r, members: [...r.members] };
  return regions;
}
function restore(s) {
  state.regions = {};
  for (const [id, r] of Object.entries(s)) state.regions[id] = { ...r, members: new Set(r.members) };
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
  return JSON.stringify(toRegionSet().regions) === JSON.stringify(state.baseline.regions);
}

// ---- mutations (each records history and marks the set dirty) -------------------------------------

export function nextColor() {
  const used = new Set(Object.values(state.regions).map((r) => r.color));
  return PALETTE.find((c) => !used.has(c)) || PALETTE[Object.keys(state.regions).length % PALETTE.length];
}

/** Add the lot to the region if absent, remove it if present. Returns true when added. */
export function toggleMember(apn, rid) {
  const r = state.regions[String(rid)];
  if (!r) return null;
  pushHistory();
  const added = !r.members.has(apn);
  added ? r.members.add(apn) : r.members.delete(apn);
  state.dirty = true;
  touch();
  return added;
}

/** Add (or remove) many lots in one undoable step. Returns the number of lots that changed. */
export function setMembers(rid, apns, add = true) {
  const r = state.regions[String(rid)];
  if (!r) return 0;
  const changes = [...apns].filter((a) => r.members.has(a) !== add);
  if (!changes.length) return 0;
  pushHistory();
  for (const a of changes) add ? r.members.add(a) : r.members.delete(a);
  state.dirty = true;
  touch();
  return changes.length;
}

export function createRegion(name, kind = "neighborhood") {
  pushHistory();
  const id = Math.max(0, ...Object.keys(state.regions).map(Number)) + 1;
  state.regions[String(id)] = normaliseRegion({ id, name, kind });
  state.dirty = true;
  touch();
  return id;
}

/** Update name / colour / organizing details. */
export function updateRegion(id, patch) {
  const r = state.regions[String(id)];
  if (!r) return;
  const allowed = ["name", "color", ...META];
  const changed = allowed.filter((k) => k in patch && patch[k] !== r[k]);
  if (!changed.length) return;
  pushHistory();
  for (const k of changed) r[k] = patch[k];
  state.dirty = true;
}
export function renameRegion(id, name) { updateRegion(id, { name }); }

export function deleteRegion(id) {
  id = String(id);
  if (!state.regions[id]) return;
  pushHistory();
  delete state.regions[id];
  state.hidden.delete(id);
  state.dirty = true;
  touch();
}

/** Return to the region set loaded at startup, keeping undo history. */
export function resetToBaseline() {
  if (!state.baseline) return;
  pushHistory();
  const keep = state.history;
  applyRegionSet(state.baseline);
  state.history = keep;
  state.dirty = false;
}
