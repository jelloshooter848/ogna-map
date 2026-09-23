// Population / land-area lookups and derived statistics. No DOM, no Leaflet.
import { tractsOf, visibleRegionIds } from "./state.js";

let stats = null;                 // { tracts: {geoid: [pop, land_sqmi]}, counties: {...}, state: {...} }
let benchmarkCounties = ["06037"];
let benchmarkName = null;         // display name of the benchmark area; null = derive from counties

export async function loadStats(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`stats file ${r.status}`);
  stats = await r.json();
  return stats;
}
export function statsLoaded() { return stats !== null; }
export function statsVersion() { return stats?.version || "unknown"; }

export function knownTract(geoid) { return Boolean(stats?.tracts?.[geoid]); }

export function tractStats(geoid) {
  const t = stats?.tracts?.[geoid];
  return t ? { population: t[0], land_sqmi: t[1] } : { population: null, land_sqmi: null };
}

export function regionStats(id) {
  let pop = 0, area = 0, knownPop = true, knownArea = true;
  const tracts = tractsOf(id);
  for (const g of tracts) {
    const s = tractStats(g);
    if (Number.isFinite(s.population)) pop += s.population; else knownPop = false;
    if (Number.isFinite(s.land_sqmi)) area += s.land_sqmi; else knownArea = false;
  }
  return {
    tracts: tracts.length,
    population: knownPop ? pop : null,
    land_sqmi: knownArea ? area : null,
    density: knownPop && knownArea && area > 0 ? pop / area : null,
  };
}

/** Stats for an arbitrary list of geoids (used for baseline comparisons). */
export function statsForTracts(geoids) {
  let pop = 0, area = 0;
  for (const g of geoids) {
    const s = tractStats(g);
    pop += s.population || 0;
    area += s.land_sqmi || 0;
  }
  return { tracts: geoids.length, population: pop, land_sqmi: area, density: area > 0 ? pop / area : null };
}

// ---- benchmark (the "share of county" denominator) ----------------------------

export function setBenchmark(counties, name = null) { benchmarkCounties = [...counties]; benchmarkName = name; }
export function countyName(fips) { return stats?.counties?.[fips]?.name || fips; }
export function countyTotals(fips) { return stats?.counties?.[fips] || null; }

export function benchmark() {
  let population = 0, land_sqmi = 0;
  for (const f of benchmarkCounties) {
    const c = stats?.counties?.[f];
    if (!c) continue;
    population += c.population;
    land_sqmi += c.land_sqmi;
  }
  const name = benchmarkName || (benchmarkCounties.length === 1 ? `${countyName(benchmarkCounties[0])} County` : "the selected area");
  return { name, counties: benchmarkCounties, population, land_sqmi, density: land_sqmi > 0 ? population / land_sqmi : null };
}

export function cumulativeStats() {
  const ids = visibleRegionIds();
  const b = benchmark();
  let population = 0, land = 0, tracts = 0, known = true;
  for (const id of ids) {
    const s = regionStats(id);
    tracts += s.tracts;
    if (Number.isFinite(s.population) && Number.isFinite(s.land_sqmi)) {
      population += s.population;
      land += s.land_sqmi;
    } else known = false;
  }
  const density = known && land > 0 ? population / land : null;
  return {
    ids, tracts,
    population: known ? population : null,
    land_sqmi: known ? land : null,
    density,
    pop_share: known && b.population ? (100 * population) / b.population : null,
    land_share: known && b.land_sqmi ? (100 * land) / b.land_sqmi : null,
    density_multiple: density && b.density ? density / b.density : null,
    benchmark: b,
  };
}

// ---- formatting ----------------------------------------------------------------

export const fmtArea = (v) => (Number.isFinite(v) ? v.toFixed(2) + " sq mi" : "area pending");
export const fmtPop = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() + " people" : "population pending");
export const fmtDensity = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v).toLocaleString() + "/sq mi" : "density pending");
export const fmtInt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : "—");
export const fmtPct = (v) => (Number.isFinite(v) ? v.toFixed(1) + "%" : "—");
export const signed = (v, digits = 0) => (v >= 0 ? "+" : "") + (digits ? v.toFixed(digits) : Math.round(v).toLocaleString());
