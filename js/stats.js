// Statistics for sets of lots, regions, the district and the city benchmark. No DOM, no Leaflet.
//
// Population and housing come from 2020 census blocks spread over each block's lots (units.js), so any
// set of lots gets estimated counts. Land area is *gross* acres (streets included): each lot carries its
// share of its block's land area in proportion to lot size, which keeps densities comparable with the
// city-wide benchmark computed from whole blocks.
import { lots, blocks, cityTotals, lotTax, taxRollInfo } from "./units.js";
import { membersOf, visibleRegionIds, neighborhoodIds, districtId, stateVersion, isHidden } from "./state.js";

const ACRES_PER_SQMI = 640;

export function statsForLots(apns) {
  const s = { lots: 0, residential_lots: 0, pop: 0, hu: 0, occ: 0, rent: 0, adults: 0, lot_sqft: 0, acres: 0, tax: 0, tax_lots: 0, tax_roll_lots: 0, value: 0, tax_pop: 0, tax_sqft: 0 };
  for (const apn of apns) {
    const l = lots.get(apn);
    if (!l) continue;
    s.lots++;
    if (l.est.hu > 0) s.residential_lots++;
    s.pop += l.est.pop; s.hu += l.est.hu; s.occ += l.est.occ; s.rent += l.est.rent; s.adults += l.est.adults;
    s.lot_sqft += l.sqft;
    const b = blocks.get(l.block);
    if (b && b.lotSqft > 0) s.acres += (Number(b.land_acres) || 0) * (l.sqft / b.lotSqft);
    const t = lotTax(apn);
    if (t.amount !== null) { s.tax += t.amount; s.tax_lots++; s.tax_pop += l.est.pop; s.tax_sqft += l.sqft; if (t.source === "roll") s.tax_roll_lots++; }
    if (t.value !== null) s.value += t.value;
  }
  return derive(s);
}

function derive(s) {
  s.density_acre = s.acres > 0 ? s.pop / s.acres : null;
  s.density_sqmi = s.acres > 0 ? (s.pop / s.acres) * ACRES_PER_SQMI : null;
  s.hu_acre = s.acres > 0 ? s.hu / s.acres : null;
  s.renter_share = s.occ > 0 ? s.rent / s.occ : null;
  s.hh_size = s.occ > 0 ? s.pop / s.occ : null;
  s.vacancy = s.hu > 0 ? 1 - s.occ / s.hu : null;
  s.minors = s.pop > 0 ? Math.max(0, s.pop - s.adults) : null;
  s.has_tax = s.tax_lots > 0;
  s.tax_complete = s.lots > 0 && s.tax_lots === s.lots;
  // Per-resident and per-sq-ft figures use only the lots that have tax data, so a partial roll isn't diluted.
  s.tax_per_capita = s.has_tax && s.tax_pop > 0 ? s.tax / s.tax_pop : null;
  s.tax_per_sqft = s.has_tax && s.tax_sqft > 0 ? s.tax / s.tax_sqft : null;
  s.tax_source = !s.has_tax ? null : s.tax_roll_lots === s.tax_lots ? "roll" : s.tax_roll_lots ? "mixed" : "est";
  return s;
}

// Region stats are cached per membership version (regions change often while editing).
let cache = new Map(), cacheVersion = -1, cacheTax = null;
function cached(key, fn) {
  if (cacheVersion !== stateVersion() || cacheTax !== taxRollInfo()) { cache = new Map(); cacheVersion = stateVersion(); cacheTax = taxRollInfo(); }
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}
export function invalidateStats() { cacheVersion = -1; }

export function regionStats(id) { return cached(`r${id}`, () => statsForLots(membersOf(id))); }

/** Lots in any of the given regions, each counted once. */
export function unionOf(ids) {
  const u = new Set();
  for (const id of ids) for (const a of membersOf(id)) u.add(a);
  return u;
}

/** Combined stats for the visible neighborhoods (union, so overlaps are not double counted). */
export function cumulativeStats() {
  const ids = visibleRegionIds().filter((id) => id !== districtId());
  const overlapLots = (() => {
    const seen = new Map();
    for (const id of ids) for (const a of membersOf(id)) seen.set(a, (seen.get(a) || 0) + 1);
    let n = 0; for (const c of seen.values()) if (c > 1) n++;
    return n;
  })();
  const s = cached(`u${ids.join(",")}`, () => statsForLots(unionOf(ids)));
  return { ids, ...s, overlap_lots: overlapLots, district: districtStats(), city: cityStats() };
}

export function districtStats() {
  const d = districtId();
  return d ? regionStats(d) : null;
}

/** How much of the district is inside at least one neighborhood. */
export function coverage() {
  const d = districtId();
  if (!d) return null;
  return cached("coverage", () => {
    const inHood = unionOf(neighborhoodIds());
    const district = membersOf(d);
    const covered = [...district].filter((a) => inHood.has(a));
    const cs = statsForLots(covered), ds = regionStats(d);
    const outside = [...inHood].filter((a) => !district.has(a)).length;
    return {
      covered_lots: covered.length, district_lots: district.size, outside_lots: outside,
      covered_pop: cs.pop, district_pop: ds.pop,
      pop_share: ds.pop > 0 ? cs.pop / ds.pop : null,
      lot_share: district.size ? covered.length / district.size : null,
      neighborhoods: neighborhoodIds().filter((id) => membersOf(id).size > 0).length,
    };
  });
}

export function cityStats() {
  return cached("city", () => {
    const t = cityTotals();
    return derive({ lots: null, residential_lots: null, ...t, lot_sqft: null, tax: 0, tax_lots: 0, tax_roll_lots: 0, value: 0 });
  });
}

export { isHidden };

// ---- formatting --------------------------------------------------------------------------------------

export const fmtInt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : "—");
export const fmtPop = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} ${Math.round(v) === 1 ? "person" : "people"}` : "—");
export const fmtAcres = (v) => (Number.isFinite(v) ? (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()) + " ac" : "—");
export const fmtDensity = (v) => (Number.isFinite(v) && v > 0 ? `${v < 10 ? v.toFixed(1) : Math.round(v)}/ac` : "—");
export const fmtPct = (v, d = 0) => (Number.isFinite(v) ? (100 * v).toFixed(d) + "%" : "—");
export const fmtMoney = (v) => (Number.isFinite(v) ? "$" + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.round(v).toLocaleString()) : "—");
export const fmtSqft = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() + " sq ft" : "—");
export const signed = (v, digits = 0) => (v >= 0 ? "+" : "") + (digits ? v.toFixed(digits) : Math.round(v).toLocaleString());
