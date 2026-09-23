#!/usr/bin/env node
/**
 * Synthetic test data with the same shape as the real build output: a street grid of census blocks over
 * Oldtown, 8 lots per block with a mix of land uses, plus a ring of city blocks without lots. Used by the
 * tests and for local previews (open http://localhost:8000/?data=test/fixture/).
 *
 *   node scripts/make_fixture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "test", "fixture");
const W = -121.592, S = 36.994, DX = 0.0016, DY = 0.0011, STREET = 0.00022, COLS = 29, ROWS = 27;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const rect = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[r6(w), r6(s)], [r6(e), r6(s)], [r6(e), r6(n)], [r6(w), r6(n)], [r6(w), r6(s)]]] });

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const USES = [
  ["01", "SINGLE FAMILY RESIDENCE", 0.62, 1], ["02", "DUPLEX", 0.1, 2], ["04", "FOURPLEX", 0.05, 4],
  ["05", "APARTMENTS", 0.05, 12], ["10", "COMMERCIAL", 0.1, 0], ["00", "VACANT LAND", 0.08, 0],
];
function pickUse() {
  let x = rand();
  for (const u of USES) { if ((x -= u[2]) <= 0) return u; }
  return USES[0];
}

const blocks = [], parcels = [];
let apnSeq = 790000;
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
  const w = W + c * DX, s = S + r * DY, e = w + DX - STREET, n = s + DY - STREET;
  const id = `06085512${String(100 + c).slice(-3)}${String(1000 + r).slice(-4)}`.slice(0, 15);
  let hu = 0;
  const lots = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const pw = w + (i * (e - w)) / 4, pe = w + ((i + 1) * (e - w)) / 4, ps = s + (j * (n - s)) / 2, pn = s + ((j + 1) * (n - s)) / 2;
    const [code, desc, , units] = pickUse();
    hu += units;
    const apn = String(apnSeq++).padStart(8, "0");
    lots.push({ type: "Feature", id: apn, properties: { apn, block: id, sqft: Math.round((pe - pw) * 88900 * (pn - ps) * 111000 * 10.7639), addr: `${100 + i * 10 + j} ${["Church", "Eigleberry", "Monterey", "Alexander", "Rosanna", "Dowdy"][c % 6]} St`, use: code, use_desc: desc, ...(units > 1 && rand() < 0.5 ? { units } : {}), year: 1890 + Math.floor(rand() * 120) }, geometry: rect(pw, ps, pe, pn) });
  }
  const occ = Math.round(hu * 0.94), rent = Math.round(occ * (0.35 + rand() * 0.4)), pop = Math.round(occ * (2.6 + rand() * 1.4));
  // Like real census blocks, a block runs to the street centerline, so neighbouring blocks share edges.
  const h = STREET / 2;
  blocks.push({ type: "Feature", id, properties: { id, pop, hu, land_acres: +((DX * 88900 * DY * 111000) / 4046.86).toFixed(3), in_city: 1, occ, rent, adults: Math.round(pop * 0.74) }, geometry: rect(w - h, s - h, e + h, n + h) });
  parcels.push(...lots);
}
// City blocks outside the lot area (benchmark only): lower density suburbs.
for (let k = 0; k < 120; k++) {
  const w = W - 0.02 + (k % 12) * 0.006, s = S + 0.035 + Math.floor(k / 12) * 0.004;
  const id = `0608551309${String(10000 + k).slice(-5)}`;
  const hu = 20 + Math.floor(rand() * 30), occ = Math.round(hu * 0.96);
  blocks.push({ type: "Feature", id, properties: { id, pop: Math.round(occ * 3.2), hu, land_acres: +((0.005 * 88900 * 0.0035 * 111000) / 4046.86).toFixed(3), in_city: 1, occ, rent: Math.round(occ * 0.25), adults: Math.round(occ * 2.3) }, geometry: rect(w, s, w + 0.005, s + 0.0035) });
}

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, "blocks.json"), JSON.stringify({ type: "FeatureCollection", features: blocks }));
await writeFile(path.join(OUT, "parcels.json"), JSON.stringify({ type: "FeatureCollection", source: "synthetic fixture", fields_used: { apn: "APN", use: "USE_CODE", use_desc: "USE_DESC" }, features: parcels }));
await writeFile(path.join(OUT, "city_limits.json"), JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { geoid: "0629504", name: "Gilroy" }, geometry: rect(W - 0.025, S - 0.01, W + COLS * DX + 0.01, S + 0.08) }] }));
console.log(`fixture: ${blocks.length} blocks, ${parcels.length} lots → ${path.relative(process.cwd(), OUT)}`);
