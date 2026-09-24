#!/usr/bin/env node
/**
 * Synthetic test data with the same shape as the real build output: a street grid of census blocks over
 * Oldtown, 8 lots per block with a mix of land uses, plus a ring of city blocks without lots. Used by the
 * tests and for local previews (open http://localhost:8000/?data=test/fixture/).
 *
 *   node scripts/make_fixture.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "test", "fixture");
const W = -121.592, S = 36.994, DX = 0.0016, DY = 0.0011, STREET = 0.00022, COLS = 29, ROWS = 27;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const rect = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[r6(w), r6(s)], [r6(e), r6(s)], [r6(e), r6(n)], [r6(w), r6(n)], [r6(w), r6(s)]]] });

// One street per column, so every address is unique (the public site's address search needs that).
const STREETS = ["Church St", "Eigleberry St", "Monterey St", "Alexander St", "Rosanna St", "Dowdy St", "Hanna St",
  "Carmel St", "Forest St", "Princevalle St", "Miller Av", "Kern Av", "Wren Av", "Welburn Av", "Lewis St", "Martin St",
  "W 6th St", "W 7th St", "8th St", "9th St", "10th St", "Old Gilroy St", "Lewis Ct", "Hoover Ct", "Ronan Av",
  "Mantelli Dr", "Santa Teresa Bl", "Chestnut St", "Railroad St"];

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
    lots.push({ type: "Feature", id: apn, properties: { apn, block: id, sqft: Math.round((pe - pw) * 88900 * (pn - ps) * 111000 * 10.7639), addr: `${100 + r * 20 + i * 2 + j} ${STREETS[c]}`, use: code, use_desc: desc, ...(units > 1 && rand() < 0.5 ? { units } : {}), year: 1890 + Math.floor(rand() * 120) }, geometry: rect(pw, ps, pe, pn) });
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
// A committed-style "Export public" file for the public site: the real district outline plus two overlapping
// neighborhoods. Private fields are included on purpose: the public build must drop them.
const center = (f) => { const [[[w, s], , [e, n]]] = f.geometry.coordinates; return [(w + e) / 2, (s + n) / 2]; };
const inBox = ([x, y], [w, s, e, n]) => x >= w && x <= e && y >= s && y <= n;
const pick = (box) => parcels.filter((f) => inBox(center(f), box)).map((f) => f.properties.apn);
const oldtown = JSON.parse(await readFile(path.join(OUT, "..", "..", "data", "regions", "oldtown.json"), "utf8"));
await mkdir(path.join(OUT, "regions"), { recursive: true });
await writeFile(path.join(OUT, "regions", "public.json"), JSON.stringify({
  format_version: "6.0", units: "apn", name: "Oldtown Gilroy", regions: [
    oldtown.regions.find((r) => r.kind === "district"),
    { id: 2, kind: "neighborhood", name: "Church Street", color: "#2b6cb0", status: "forming", meets: "First Tuesday, 7 pm",
      coordinators: "Pat Example", contact: "pat@example.org", notes: "private note", members: pick([-121.5760, 37.0030, -121.5690, 37.0080]) },
    { id: 3, kind: "neighborhood", name: "Eigleberry", color: "#dd6b20", status: "idea", members: pick([-121.5700, 37.0050, -121.5650, 37.0100]) },
  ],
}));
// Content for the public site, in the shape of content/*.json: approved and unapproved rows, a past event, a
// neighborhood with no Spanish text (the site falls back to English and flags it).
const day = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
const C = path.join(OUT, "content");
await mkdir(C, { recursive: true });
const resources = JSON.parse(await readFile(path.join(OUT, "..", "..", "content", "resources.json"), "utf8"));
resources.push({ category: "projects", title_en: "Church Street sidewalk repair", title_es: "Reparación de banquetas en Church Street", link: "https://example.org/sidewalk", neighborhood: "church-street" });
const files = {
  "site.json": { start_group_link: "https://example.org/start", starter_kit_link: "https://example.org/kit", suggest_link: "https://example.org/suggest" },
  "neighborhoods.json": [
    { map_id: 2, name: "Church Street", description_en: "Neighbors along Church Street between Fifth and Ninth.", description_es: "Vecinos de Church Street entre Fifth y Ninth.", meets_en: "First Tuesday, 7 pm", meets_es: "Primer martes, 7 pm", join_link: "https://example.org/join-church", approved: true },
    { map_id: 3, name: "Eigleberry", description_en: "Eigleberry Street block group.", approved: "TRUE" },
    { map_id: 4, name: "Draft", description_en: "not approved", approved: false },
  ],
  "events.json": [
    { date: day(10), time: "10:00", title_en: "Church Street cleanup", title_es: "Limpieza de Church Street", address: "Church St & 6th St", lat: 37.0055, lng: -121.5725, neighborhood: "church-street", approved: true },
    { date: day(20), time: "18:00", title_en: "Oldtown potluck", address: "Downtown", lat: 37.0065, lng: -121.568, approved: true },
    { date: day(-5), title_en: "Past event", approved: true },
    { date: day(5), title_en: "Unapproved event", approved: false },
    { date: day(30), title_en: "Place to be announced", lat: null, lng: "", approved: true },
  ],
  "places.json": [
    { name: "Corner Café", category: "shop", description_en: "Coffee and pastries.", description_es: "Café y pan dulce.", lat: 37.0062, lng: -121.5705, website: "https://example.org/cafe", approved: true },
    { name: "Hidden Shop", category: "shop", lat: 37.006, lng: -121.57, approved: false },
  ],
  "resources.json": resources,
};
for (const [name, body] of Object.entries(files)) await writeFile(path.join(C, name), JSON.stringify(body, null, 1));
// OpenStreetMap places as the Action writes them (the tests build without network).
await mkdir(path.join(OUT, "public"), { recursive: true });
await writeFile(path.join(OUT, "public", "osm.json"), JSON.stringify({ source: "fixture", places: [
  { cat: "park", name: "Fixture Park", lat: 37.0075, lng: -121.5745, osm: "way/1" },
  { cat: "library", name: "Fixture Library", name_es: "Biblioteca de prueba", lat: 37.0068, lng: -121.5712, osm: "node/2" },
  { cat: "school", name: "Fixture School", lat: 37.0040, lng: -121.5760, osm: "way/3" },
  { cat: "transit", name: "", lat: 37.0052, lng: -121.5670, osm: "node/4" },
] }));

console.log(`fixture: ${blocks.length} blocks, ${parcels.length} lots → ${path.relative(process.cwd(), OUT)}`);
