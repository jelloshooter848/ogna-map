// Lots (parcels) and census blocks: loading, land-use classification, per-lot estimates and tax lookup.
// No DOM, no Leaflet, so it runs under Node for tests.
import { UNIT_WEIGHTS, USE_RULES, USE_CODE_RULES, EST_TAX_RATE } from "./config.js";

export const lots = new Map();        // apn -> lot record (see loadData)
export const blocks = new Map();      // block GEOID -> block record
export const lotFeatures = new Map(); // apn -> GeoJSON feature (geometry for the map)
export const blockFeatures = new Map();
let taxRoll = null;                   // Map apn -> { tax?, land?, impr?, exempt? } from a local import
let taxRollMeta = null;               // { name, rows, columns, loaded_at }

export const normaliseApn = (v) => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();

/** Land-use class of a lot from its description and code (see USE_RULES / USE_CODE_RULES in config). */
export function classifyLot(p) {
  const desc = `${p.use_desc || ""} ${/[a-z]/i.test(p.use || "") ? p.use : ""}`.trim();
  if (desc) for (const [re, cls] of USE_RULES) if (re.test(desc)) return cls;
  const code = String(p.use || "").trim();
  if (code) {
    for (const len of [3, 2, 1]) {
      const cls = USE_CODE_RULES[code.slice(0, len)];
      if (cls) return cls;
    }
    return "nonresidential";
  }
  return "unknown";
}

/** Housing-unit weight of a lot: its recorded unit count, else a default for its class. */
export function unitWeight(lot) {
  if (lot.units > 0) return lot.units;
  const w = UNIT_WEIGHTS[lot.cls];
  if (w === undefined) return null; // unknown use: caller falls back to lot area
  if (typeof w === "number") return w;
  return Math.max(w.min, Math.round(lot.sqft / w.sqftPerUnit));
}

const ALLOCATED = ["pop", "hu", "occ", "rent", "adults"];

/**
 * Load parsed GeoJSON and spread each block's census counts over its lots. Residential lots share a
 * block in proportion to unitWeight(); if a block has people but no lot identified as residential, the
 * counts are spread by lot area instead so the block total is never lost.
 */
export function loadData({ parcels, blocks: blockFc }) {
  lots.clear(); blocks.clear(); lotFeatures.clear(); blockFeatures.clear();
  for (const f of blockFc.features) {
    const p = f.properties;
    blocks.set(p.id, { ...p, lotSqft: 0, lots: [] });
    blockFeatures.set(p.id, f);
  }
  for (const f of parcels.features) {
    const p = f.properties;
    const apn = normaliseApn(p.apn ?? f.id);
    if (!apn || lots.has(apn)) continue;
    const lot = { ...p, apn, sqft: Number(p.sqft) || 0, est: Object.fromEntries(ALLOCATED.map((k) => [k, 0])) };
    lot.cls = classifyLot(lot);
    lots.set(apn, lot);
    lotFeatures.set(apn, f);
    const b = blocks.get(lot.block);
    if (b) { b.lotSqft += lot.sqft; b.lots.push(lot); } else lot.block = null;
  }
  for (const b of blocks.values()) {
    if (!b.lots.length) continue;
    let weights = b.lots.map((l) => unitWeight(l));
    const known = weights.filter((w) => w !== null);
    if (known.length && known.every((w) => w === 0) && weights.some((w) => w === null)) weights = weights.map((w) => (w === null ? 1 : w));
    let total = weights.reduce((a, w) => a + (w || 0), 0);
    if (total === 0) { weights = b.lots.map((l) => l.sqft || 1); total = weights.reduce((a, w) => a + w, 0); }
    else weights = weights.map((w) => w || 0);
    b.lots.forEach((l, i) => {
      const share = weights[i] / total;
      l.share = share;
      for (const k of ALLOCATED) l.est[k] = Number.isFinite(b[k]) ? b[k] * share : 0;
    });
  }
  return { lots: lots.size, blocks: blocks.size };
}

/** City benchmark: every block inside the city limits. */
export function cityTotals() {
  const t = { pop: 0, hu: 0, occ: 0, rent: 0, adults: 0, acres: 0, blocks: 0 };
  for (const b of blocks.values()) {
    if (!b.in_city) continue;
    for (const k of ALLOCATED) t[k] += Number(b[k]) || 0;
    t.acres += Number(b.land_acres) || 0;
    t.blocks++;
  }
  return t;
}

// ---- tax -----------------------------------------------------------------------------------------

export function setTaxRoll(map, meta) { taxRoll = map; taxRollMeta = meta; }
export function clearTaxRoll() { taxRoll = null; taxRollMeta = null; }
export function taxRollInfo() { return taxRollMeta; }

/** { amount, source: "roll" | "est" | null, value } — the roll's billed amount wins over an estimate. */
export function lotTax(apn) {
  const r = taxRoll?.get(apn);
  if (!r) return { amount: null, source: null, value: null };
  const value = Number.isFinite(r.land) || Number.isFinite(r.impr)
    ? Math.max(0, (r.land || 0) + (r.impr || 0) - (r.exempt || 0))
    : (Number.isFinite(r.net) ? r.net : null);
  if (Number.isFinite(r.tax)) return { amount: r.tax, source: "roll", value };
  if (value !== null) return { amount: value * EST_TAX_RATE, source: "est", value };
  return { amount: null, source: null, value: null };
}
