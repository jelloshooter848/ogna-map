// Region-set files: export, import (current v5 format and legacy v3/v4 diff exports), browser save.
import { STORAGE_KEY, LEGACY_STORAGE_KEYS, LEGACY_WORKBOOK_URL, PALETTE } from "./config.js";
import { state, toRegionSet } from "./state.js";
import { knownTract, statsLoaded } from "./stats.js";

/** Drop tract ids that are not 2020 California tracts; records how many were removed on the set. */
function dropUnknownTracts(set) {
  if (!statsLoaded()) return set;
  let dropped = 0;
  for (const r of set.regions) {
    const keep = r.tracts.filter(knownTract);
    dropped += r.tracts.length - keep.length;
    r.tracts = keep;
  }
  set.dropped_unknown_tracts = dropped;
  return set;
}

export function currentRegionSet() {
  return { ...toRegionSet(), exported_at: new Date().toISOString() };
}

const slug = (s) => (s || "regions").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function downloadRegionSet() {
  const payload = currentRegionSet();
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(state.setName)}_v5.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function saveBrowser() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentRegionSet()));
}

/** Returns a region set from the browser save (current or legacy key), or null if none. */
export async function loadBrowser() {
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) for (const k of LEGACY_STORAGE_KEYS) { raw = localStorage.getItem(k); if (raw) break; }
  if (!raw) return null;
  return parseImport(JSON.parse(raw));
}

/** Accepts a parsed JSON payload; returns a normalised v5 region set or throws. */
export async function parseImport(payload) {
  if (payload && Array.isArray(payload.regions) && String(payload.format_version || "").startsWith("5")) return dropUnknownTracts(normaliseV5(payload));
  if (payload && payload.baseline === "workbook v32" && payload.regions && Array.isArray(payload.changes)) return dropUnknownTracts(await convertLegacy(payload));
  throw new Error("Not a recognised region-set file (expected format 5.x, or a v3/v4 'workbook v32' export).");
}

function normaliseV5(p) {
  const regions = p.regions.map((r, i) => {
    const id = Number(r.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`region ${i + 1} has an invalid id`);
    const tracts = (r.tracts || []).map((g) => String(g)).filter((g) => /^\d{11}$/.test(g));
    return { id, name: String(r.name || `Region ${id}`), color: r.color || PALETTE[(id - 1) % PALETTE.length], ...(r.area ? { area: String(r.area) } : {}), tracts };
  });
  const ids = new Set(regions.map((r) => r.id));
  if (ids.size !== regions.length) throw new Error("duplicate region ids");
  return { ...p, regions, tract_labels: p.tract_labels || {} };
}

/**
 * Legacy v3/v4 exports were diffs against the embedded 'workbook v32' baseline. Replay them the way the
 * old app's restorePayload did, then renumber and colour like build_baseline.py.
 */
async function convertLegacy(payload) {
  const r = await fetch(LEGACY_WORKBOOK_URL);
  if (!r.ok) throw new Error("legacy workbook reference not available");
  const wb = await r.json();
  const regions = {};
  for (const [id, reg] of Object.entries(wb.regions)) if (payload.regions[id]) regions[id] = { name: reg.name };
  for (const [id, reg] of Object.entries(payload.regions)) (regions[id] ||= {}).name = reg.name || regions[id]?.name || `Region ${id}`;
  const assignment = { ...wb.tracts };
  for (const ch of payload.changes) {
    const ct = String(ch.ct20 ?? (ch.geoid || "").slice(5) ?? "").padStart(6, "0");
    if (ct.length !== 6) continue;
    if (ch.excluded || ch.to_region == null) delete assignment[ct];
    else { const id = String(ch.to_region); regions[id] ||= { name: ch.to_region_name || `Region ${id}` }; assignment[ct] = Number(id); }
  }
  for (const ct0 of payload.excluded_tracts || []) delete assignment[String(ct0).padStart(6, "0")];

  const members = {};
  for (const [ct, rid] of Object.entries(assignment)) (members[String(rid)] ||= []).push("06037" + ct);
  const oldIds = Object.keys(regions).sort((a, b) => +a - +b);
  return {
    format_version: "5.0",
    name: "Imported legacy region set",
    description: `Converted from ${payload.title || "a legacy export"} (format ${payload.format_version || "3.x"}, exported ${payload.exported_at || "unknown"}).`,
    default_area: "la",
    regions: oldIds.map((old, i) => ({ id: i + 1, name: regions[old].name, color: PALETTE[(Number(old) - 1) % PALETTE.length], tracts: (members[old] || []).sort() })),
    tract_labels: {},
  };
}
