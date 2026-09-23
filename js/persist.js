// Region-set files: export (full or without private contact details), import, browser save.
import { STORAGE_KEY, PALETTE } from "./config.js";
import { state, toRegionSet } from "./state.js";
import { lots, normaliseApn } from "./units.js";

export function currentRegionSet(opts) {
  return { ...toRegionSet(opts), exported_at: new Date().toISOString() };
}

const slug = (s) => (s || "regions").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function downloadRegionSet({ includePrivate = true } = {}) {
  const payload = currentRegionSet({ includePrivate });
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(state.setName)}_neighborhoods${includePrivate ? "" : "_public"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function saveBrowser() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentRegionSet()));
}

/** Returns the region set from the browser save, or null if none. */
export function loadBrowser() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? parseImport(JSON.parse(raw)) : null;
}

/** Accepts a parsed JSON payload; returns a normalised 6.x region set or throws. */
export function parseImport(p) {
  if (!p || !Array.isArray(p.regions) || !String(p.format_version || "").startsWith("6")) {
    throw new Error("Not a recognised neighborhood file (expected format 6.x from this app).");
  }
  let dropped = 0;
  const regions = p.regions.map((r, i) => {
    const id = Number(r.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`region ${i + 1} has an invalid id`);
    let members = (r.members || []).map(normaliseApn).filter(Boolean);
    if (lots.size) {
      const keep = members.filter((a) => lots.has(a));
      dropped += members.length - keep.length;
      members = keep;
    }
    return { ...r, id, name: String(r.name || `Neighborhood ${id}`), color: r.color || PALETTE[(id - 1) % PALETTE.length], members };
  });
  if (new Set(regions.map((r) => r.id)).size !== regions.length) throw new Error("duplicate region ids");
  return { ...p, regions, dropped_unknown_lots: dropped };
}
