#!/usr/bin/env node
/**
 * Build the Oldtown Gilroy data files. Runs in GitHub Actions (.github/workflows/build-data.yml),
 * which has open internet; the result is committed back to the branch. Every stage is independent:
 * a failure is recorded in data/sources/build_report.json and the other stages still run.
 *
 *   node scripts/build_gilroy.mjs
 *
 * Outputs (all public data; nothing here comes from the tax roll):
 *   data/city_limits.json          Gilroy place boundary (TIGER/Line 2020 places)
 *   data/blocks.json               2020 census blocks in and around Gilroy with population, housing
 *                                  units (TIGER tabblock20 POP20/HOUSING20), occupied and renter-occupied
 *                                  units (2020 DHC H3/H4) and adults 18+ (P.L. 94-171 P3)
 *   data/parcels.json              Santa Clara County parcels around Oldtown: APN, block, lot size, and
 *                                  the land-use / unit / situs fields the county layer offers. No owner
 *                                  names, no assessed values.
 *   data/sources/boundary_streets.geojson  OSM ways for the streets that bound the district
 *   data/sources/build_report.json stage results, sanity checks, parcel-layer field inventory
 *
 * Raw downloads are cached in data/raw/ (gitignored). Assessed values, if the parcel layer has them, are
 * written only to data/raw/parcel_values.csv and never committed.
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as turf from "@turf/turf";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "data", "raw");
const DATA = path.join(ROOT, "data");
const SOURCES = path.join(DATA, "sources");
const MAPSHAPER = path.join(ROOT, "node_modules", ".bin", "mapshaper");
const CONFIG = JSON.parse(await readFile(path.join(ROOT, "scripts", "sources.json"), "utf8"));

const PLACE_URL = "https://www2.census.gov/geo/tiger/TIGER2020/PLACE/tl_2020_06_place.zip";
const BLOCKS_URL = "https://www2.census.gov/geo/tiger/TIGER2020/TABBLOCK20/tl_2020_06_tabblock20.zip";
const DHC_URL = "https://api.census.gov/data/2020/dec/dhc";
const PL_URL = "https://api.census.gov/data/2020/dec/pl";
const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

const SQM_PER_ACRE = 4046.8564224;
const SQFT_PER_SQM = 10.763910417;
const EXPECTED_GILROY_POP = 59520; // 2020 Census, Gilroy city
const SENSITIVE = /owner|own_|taxpayer|mail|care_?of|c_o_|grantee|grantor|buyer|seller/i;
const VALUE_FIELD = /land_?val|impr|assess|net_?val|total_?val|exempt|value|tax/i;

// A real parcel layer has thousands of lots in the Oldtown box; fewer means a partial or unrelated layer.
const MIN_LOTS = CONFIG.parcels.min_lots || 1500;
const report = { built_at: new Date().toISOString(), stages: {}, checks: {} };

// ---- helpers -------------------------------------------------------------------------------------

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function download(url, dest) {
  if (await exists(dest)) { console.log("using cached", path.relative(ROOT, dest)); return; }
  console.log("downloading", url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));
}

async function getJson(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "user-agent": "ogna-map data build (github actions)", ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${url.slice(0, 200)}: HTTP ${r.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${url.slice(0, 200)}: not JSON: ${text.slice(0, 200)}`); }
}

function mapshaper(args) {
  console.log("mapshaper", args.join(" ").slice(0, 300));
  execFileSync(MAPSHAPER, args, { stdio: ["ignore", "inherit", "inherit"], cwd: ROOT });
}

async function stage(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    report.stages[name] = { ok: true, seconds: (Date.now() - t0) / 1000, ...(result || {}) };
    console.log(`✓ ${name}`, JSON.stringify(result || {}).slice(0, 400));
  } catch (e) {
    report.stages[name] = { ok: false, seconds: (Date.now() - t0) / 1000, error: String(e?.stack || e).slice(0, 2000) };
    console.error(`✗ ${name}:`, e);
  }
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
function inBox([w, s, e, n], [x, y]) { return x >= w && x <= e && y >= s && y <= n; }
async function writeJson(p, obj, pretty = false) {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, pretty ? 1 : 0));
}
/** Round all coordinates of a geometry in place. */
function roundGeometry(g, d = 6) {
  const walk = (c) => (typeof c[0] === "number" ? [round(c[0], d), round(c[1], d)] : c.map(walk));
  if (g?.coordinates) g.coordinates = walk(g.coordinates);
  return g;
}

// ---- stage 1: city limits -------------------------------------------------------------------------

let cityLimits = null;
async function buildCityLimits() {
  const zip = path.join(RAW, path.basename(PLACE_URL));
  await download(PLACE_URL, zip);
  const out = path.join(DATA, "city_limits.json");
  mapshaper(["-i", path.relative(ROOT, zip), "-filter", `NAME=="${CONFIG.city.name}"`,
    "-each", "geoid=GEOID, name=NAME", "-filter-fields", "geoid,name",
    "-o", path.relative(ROOT, out), "format=geojson", "precision=0.000001"]);
  cityLimits = JSON.parse(await readFile(out, "utf8"));
  if (!cityLimits.features.length) throw new Error(`no place named ${CONFIG.city.name}`);
  return { geoid: cityLimits.features[0].properties.geoid, bbox: turf.bbox(cityLimits).map((v) => round(v, 5)) };
}

// ---- stage 2: census blocks -----------------------------------------------------------------------

let blocks = null; // FeatureCollection
async function buildBlocks() {
  const zip = path.join(RAW, path.basename(BLOCKS_URL));
  await download(BLOCKS_URL, zip);
  const tmp = path.join(RAW, "blocks_area.json");
  const [w, s, e, n] = CONFIG.blocks_bbox;
  mapshaper(["-i", path.relative(ROOT, zip),
    "-filter", `COUNTYFP20=="${CONFIG.county_fips.slice(2)}" && this.centroidX > ${w} && this.centroidX < ${e} && this.centroidY > ${s} && this.centroidY < ${n}`,
    "-filter-fields", "GEOID20,POP20,HOUSING20,ALAND20",
    "-o", path.relative(ROOT, tmp), "format=geojson", "precision=0.000001"]);
  const raw = JSON.parse(await readFile(tmp, "utf8"));
  const city = cityLimits?.features?.[0];
  const oldtownBox = CONFIG.parcels_bbox;
  const features = [];
  for (const f of raw.features) {
    if (!f.geometry) continue;
    const p = f.properties;
    const pt = turf.pointOnFeature(f).geometry.coordinates;
    const in_city = city ? turf.booleanPointInPolygon(pt, city) : false;
    const nearOldtown = inBox(oldtownBox, pt);
    if (!in_city && !nearOldtown) continue;
    features.push({
      type: "Feature", id: p.GEOID20,
      properties: { id: p.GEOID20, pop: Number(p.POP20), hu: Number(p.HOUSING20), land_acres: round(Number(p.ALAND20) / SQM_PER_ACRE, 3), in_city: in_city ? 1 : 0 },
      geometry: roundGeometry(f.geometry),
    });
  }
  blocks = { type: "FeatureCollection", features };
  const cityPop = features.filter((f) => f.properties.in_city).reduce((a, f) => a + f.properties.pop, 0);
  report.checks.city_population_from_blocks = cityPop;
  report.checks.city_population_expected = EXPECTED_GILROY_POP;
  report.checks.city_population_ratio = round(cityPop / EXPECTED_GILROY_POP, 4);
  return { blocks: features.length, city_blocks: features.filter((f) => f.properties.in_city).length, city_pop: cityPop };
}

// ---- stage 3: occupancy, tenure, adults (Census API) ----------------------------------------------

async function censusBlocks(base, vars, tracts) {
  const st = CONFIG.county_fips.slice(0, 2), co = CONFIG.county_fips.slice(2);
  const key = process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : "";
  const rows = [];
  const parse = (j) => {
    const [head, ...data] = j;
    for (const r of data) {
      const o = Object.fromEntries(head.map((h, i) => [h, r[i]]));
      o.GEOID = `${o.state}${o.county}${o.tract}${o.block}`;
      rows.push(o);
    }
  };
  try {
    parse(await getJson(`${base}?get=${vars.join(",")}&for=block:*&in=state:${st}&in=county:${co}&in=tract:*${key}`));
  } catch (e) {
    console.log("wildcard tract query failed, querying tract by tract:", String(e).slice(0, 200));
    for (const t of tracts) parse(await getJson(`${base}?get=${vars.join(",")}&for=block:*&in=state:${st}&in=county:${co}&in=tract:${t}${key}`));
  }
  return rows;
}

async function addHousingDetail() {
  if (!blocks) throw new Error("blocks stage failed");
  const tracts = [...new Set(blocks.features.map((f) => f.id.slice(5, 11)))];
  const want = new Set(blocks.features.map((f) => f.id));
  const dhc = await censusBlocks(DHC_URL, ["H3_001N", "H3_002N", "H4_001N", "H4_004N"], tracts);
  const pl = await censusBlocks(PL_URL, ["P1_001N", "P3_001N"], tracts);
  const byId = {};
  for (const r of dhc) if (want.has(r.GEOID)) byId[r.GEOID] = { occ: +r.H3_002N, rent: +r.H4_004N };
  let mismatches = 0;
  for (const r of pl) if (want.has(r.GEOID)) Object.assign(byId[r.GEOID] ||= {}, { adults: +r.P3_001N, pl_pop: +r.P1_001N });
  for (const f of blocks.features) {
    const d = byId[f.id];
    if (!d) continue;
    f.properties.occ = d.occ ?? null;
    f.properties.rent = d.rent ?? null;
    f.properties.adults = d.adults ?? null;
    if (d.pl_pop != null && d.pl_pop !== f.properties.pop) mismatches++;
  }
  report.checks.pl_vs_tiger_pop_mismatches = mismatches;
  return { matched: Object.keys(byId).length, of: want.size };
}

// ---- stage 4: OSM boundary streets ---------------------------------------------------------------

async function boundaryStreets() {
  const [w, s, e, n] = CONFIG.blocks_bbox;
  const names = CONFIG.boundary_streets.join("|");
  const q = `[out:json][timeout:60];(way["highway"]["name"~"^(${names})$",i](${s},${w},${n},${e});way["highway"]["ref"~"US 101"](${s},${w},${n},${e}););out geom;`;
  let j = null, lastErr = null;
  for (const u of OVERPASS_URLS) {
    try { j = await getJson(u, { method: "POST", body: new URLSearchParams({ data: q }) }); break; } catch (e) { lastErr = e; }
  }
  if (!j) throw lastErr;
  const features = j.elements.filter((el) => el.geometry).map((el) => ({
    type: "Feature",
    properties: { osm_id: el.id, name: el.tags?.name || null, ref: el.tags?.ref || null, highway: el.tags?.highway },
    geometry: { type: "LineString", coordinates: el.geometry.map((p) => [round(p.lon, 6), round(p.lat, 6)]) },
  }));
  await writeJson(path.join(SOURCES, "boundary_streets.geojson"), { type: "FeatureCollection", features });
  const counts = {};
  for (const f of features) counts[f.properties.name || f.properties.ref] = (counts[f.properties.name || f.properties.ref] || 0) + 1;
  return { ways: features.length, by_name: counts };
}

// ---- stage 5: parcels ------------------------------------------------------------------------------

/** Find candidate parcel layers: configured URLs first, then ArcGIS Hub DCAT feeds and Socrata. */
async function discoverParcelLayers() {
  const found = [];
  const log = [];
  for (const u of CONFIG.parcels.arcgis_layers || []) found.push({ kind: "arcgis", url: u, via: "config" });
  for (const feed of CONFIG.parcels.dcat_feeds || []) {
    try {
      const j = await getJson(feed);
      for (const d of j.dataset || []) {
        if (!/parcel/i.test(d.title || "")) continue;
        const urls = [d.landingPage, ...(d.distribution || []).map((x) => x.accessURL || x.downloadURL)].filter(Boolean);
        log.push({ feed, title: d.title, urls: urls.slice(0, 6) });
        for (const u of urls) {
          const m = String(u).match(/^(https?:\/\/[^?#]+\/(?:FeatureServer|MapServer)(?:\/\d+)?)/i);
          if (m) found.push({ kind: "arcgis", url: m[1], via: `dcat:${d.title}` });
        }
      }
    } catch (e) { log.push({ feed, error: String(e).slice(0, 300) }); }
  }
  for (const q of CONFIG.parcels.arcgis_search || []) {
    try {
      const j = await getJson(`https://www.arcgis.com/sharing/rest/search?f=json&num=25&q=${encodeURIComponent(q)}`);
      for (const it of j.results || []) {
        log.push({ search: q, title: it.title, owner: it.owner, type: it.type, url: it.url });
        if (it.url && /Feature Service|Map Service/.test(it.type) && /parcel/i.test(it.title)) found.push({ kind: "arcgis", url: it.url, via: `search:${it.title} (${it.owner})` });
      }
    } catch (e) { log.push({ search: q, error: String(e).slice(0, 300) }); }
  }
  for (const dom of CONFIG.parcels.socrata_domains || []) {
    try {
      const j = await getJson(`https://api.us.socrata.com/api/catalog/v1?domains=${dom}&search_context=${dom}&q=parcel&limit=20`);
      for (const r of j.results || []) {
        log.push({ socrata: dom, name: r.resource?.name, id: r.resource?.id, type: r.resource?.type, lens: r.resource?.lens_view_type });
        found.push({ kind: "socrata", domain: dom, id: r.resource?.id, via: `socrata:${r.resource?.name}` });
      }
    } catch (e) { log.push({ socrata: dom, error: String(e).slice(0, 300) }); }
  }
  // Dedupe while keeping order.
  const seen = new Set();
  return { candidates: found.filter((c) => { const k = c.url || `${c.domain}/${c.id}`; if (seen.has(k)) return false; seen.add(k); return true; }), log };
}

/** Expand a FeatureServer/MapServer root into its polygon layers. */
async function arcgisLayers(url) {
  if (/\/\d+$/.test(url)) return [url];
  const j = await getJson(`${url}?f=json`);
  return (j.layers || []).filter((l) => !l.geometryType || /Polygon/i.test(l.geometryType)).map((l) => `${url}/${l.id}`);
}

async function fetchArcgisParcels(layerUrl) {
  const meta = await getJson(`${layerUrl}?f=json`);
  if (meta.geometryType && !/Polygon/i.test(meta.geometryType)) throw new Error(`not polygons: ${meta.geometryType}`);
  const [w, s, e, n] = CONFIG.parcels_bbox;
  const geometry = JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n, spatialReference: { wkid: 4326 } });
  const base = { where: "1=1", geometry, geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects" };
  const cnt = await getJson(`${layerUrl}/query?${new URLSearchParams({ ...base, returnCountOnly: "true", f: "json" })}`);
  if (cnt.error) throw new Error("count: " + JSON.stringify(cnt.error));
  if (!(cnt.count >= MIN_LOTS)) throw new Error(`only ${cnt.count} features in the Oldtown box`);
  const page = Math.min(meta.maxRecordCount || 1000, 2000);
  const features = [];
  for (let offset = 0; offset < cnt.count; offset += page) {
    const q = new URLSearchParams({ ...base, outFields: "*", outSR: "4326", returnGeometry: "true", resultOffset: String(offset), resultRecordCount: String(page), orderByFields: meta.objectIdField || "OBJECTID", f: "geojson" });
    const j = await getJson(`${layerUrl}/query?${q}`);
    if (j.error) throw new Error("query: " + JSON.stringify(j.error));
    features.push(...(j.features || []));
    console.log(`  ${features.length}/${cnt.count}`);
    if (!j.features?.length) break;
  }
  return { source: layerUrl, name: meta.name, fields: (meta.fields || []).map((f) => ({ name: f.name, type: f.type, alias: f.alias })), features };
}

async function fetchSocrataParcels(domain, id) {
  const view = await getJson(`https://${domain}/api/views/${id}.json`);
  const geoCol = (view.columns || []).find((c) => /polygon|multipolygon|location|point/i.test(c.dataTypeName || ""));
  if (!geoCol || !/polygon/i.test(geoCol.dataTypeName)) throw new Error(`no polygon column (${(view.columns || []).map((c) => c.dataTypeName).join(",")})`);
  const [w, s, e, n] = CONFIG.parcels_bbox;
  const url = `https://${domain}/resource/${id}.geojson?$where=${encodeURIComponent(`intersects(${geoCol.fieldName}, 'POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))')`)}&$limit=50000`;
  const j = await getJson(url);
  if (!(j.features?.length >= MIN_LOTS)) throw new Error(`only ${j.features?.length} features`);
  return { source: `https://${domain}/d/${id}`, name: view.name, fields: (view.columns || []).map((c) => ({ name: c.fieldName, type: c.dataTypeName, alias: c.name })), features: j.features };
}

const APN_PATTERNS = [/^apn$/i, /^apn_?(num|no|number)?$/i, /apn/i, /parcel_?(id|num|no|number)/i, /parcelnumber/i, /^pin$/i];

function pickField(names, patterns) {
  for (const p of patterns) { const hit = names.find((n) => p.test(n)); if (hit) return hit; }
  return null;
}

async function buildParcels() {
  const { candidates, log } = await discoverParcelLayers();
  report.parcel_discovery = { candidates: candidates.slice(0, 40), log: log.slice(0, 80) };
  let got = null;
  const attempts = [];
  // Accept a layer only if most of its polygons carry a parcel number.
  const usable = (g) => {
    const names = [...new Set(g.features.flatMap((f) => Object.keys(f.properties || {})))];
    const apnF = (CONFIG.parcels.fields || {}).apn || pickField(names, APN_PATTERNS);
    const filled = apnF ? g.features.filter((f) => String(f.properties?.[apnF] ?? "").replace(/[^0-9A-Za-z]/g, "")).length : 0;
    if (filled < MIN_LOTS) throw new Error(`only ${filled} of ${g.features.length} features have a parcel number (field ${apnF})`);
    return g;
  };
  for (const c of candidates) {
    try {
      if (c.kind === "arcgis") {
        for (const layer of await arcgisLayers(c.url)) {
          try { got = usable(await fetchArcgisParcels(layer)); attempts.push({ layer, ok: true, n: got.features.length }); break; }
          catch (e) { attempts.push({ layer, error: String(e).slice(0, 300) }); }
        }
      } else {
        got = usable(await fetchSocrataParcels(c.domain, c.id));
        attempts.push({ socrata: c.id, ok: true, n: got.features.length });
      }
    } catch (e) { attempts.push({ candidate: c.url || c.id, error: String(e).slice(0, 300) }); }
    if (got) break;
  }
  report.parcel_discovery.attempts = attempts;
  if (!got) throw new Error("no parcel layer could be fetched; see parcel_discovery");

  const names = [...new Set(got.features.flatMap((f) => Object.keys(f.properties || {})))];
  const F = CONFIG.parcels.fields || {};
  const apnF = F.apn || pickField(names, APN_PATTERNS);
  const useF = F.use || pickField(names, [/use_?code/i, /^luc$/i, /land_?use/i, /usecode/i, /use_?desc/i, /^use$/i]);
  const useDescF = F.use_desc || pickField(names.filter((n) => n !== useF), [/use_?desc/i, /land_?use_?desc/i, /class/i]);
  const unitsF = F.units || pickField(names, [/^units$/i, /dwell/i, /num_?units/i, /unit_?count/i, /living_?units/i]);
  const yearF = F.year || pickField(names, [/year_?built/i, /yr_?built/i, /yrblt/i]);
  const addrF = F.address || pickField(names, [/situs_?addr/i, /situs/i, /^address$/i, /site_?addr/i, /full_?addr/i]);
  const zoneF = F.zoning || pickField(names, [/zon/i]);
  if (!apnF) throw new Error(`no APN field among ${names.join(", ")}`);

  // Field inventory with example values, except for anything that looks like owner data.
  const inventory = names.map((n) => {
    const vals = got.features.map((f) => f.properties?.[n]).filter((v) => v !== null && v !== undefined && v !== "");
    const sensitive = SENSITIVE.test(n);
    const valueLike = VALUE_FIELD.test(n);
    const distinct = new Set(vals.map(String));
    const entry = { name: n, filled: vals.length, distinct: distinct.size, sensitive, value_like: valueLike };
    if (!sensitive && !valueLike) entry.examples = [...distinct].slice(0, 5);
    if (valueLike && vals.every((v) => Number.isFinite(Number(v)))) {
      const nums = vals.map(Number).sort((a, b) => a - b);
      entry.numeric_summary = { min: nums[0], median: nums[Math.floor(nums.length / 2)], max: nums[nums.length - 1] };
    }
    return entry;
  });
  const useCounts = {};
  if (useF) for (const f of got.features) {
    const k = `${f.properties[useF] ?? ""}${useDescF ? " | " + (f.properties[useDescF] ?? "") : ""}`;
    useCounts[k] = (useCounts[k] || 0) + 1;
  }

  // Index blocks for the block lookup.
  const blockIndex = (blocks?.features || []).map((b) => ({ id: b.id, bbox: turf.bbox(b), f: b }));
  const blockOf = (pt) => {
    for (const b of blockIndex) if (inBox(b.bbox, pt) && turf.booleanPointInPolygon(pt, b.f)) return b.id;
    return null;
  };

  const out = [];
  const values = [];
  const seen = new Map();
  for (const f of got.features) {
    if (!f.geometry || !/Polygon/.test(f.geometry.type)) continue;
    const p = f.properties || {};
    const apn = String(p[apnF] ?? "").replace(/[^0-9A-Za-z]/g, "");
    if (!apn) continue;
    const pt = turf.pointOnFeature(f).geometry.coordinates;
    const props = {
      apn,
      block: blockOf(pt),
      sqft: Math.round(turf.area(f) * SQFT_PER_SQM),
      ...(addrF && p[addrF] ? { addr: String(p[addrF]).trim() } : {}),
      ...(useF && p[useF] != null ? { use: String(p[useF]).trim() } : {}),
      ...(useDescF && p[useDescF] != null ? { use_desc: String(p[useDescF]).trim() } : {}),
      ...(unitsF && Number(p[unitsF]) > 0 ? { units: Number(p[unitsF]) } : {}),
      ...(yearF && Number(p[yearF]) > 1800 ? { year: Number(p[yearF]) } : {}),
      ...(zoneF && p[zoneF] ? { zone: String(p[zoneF]).trim() } : {}),
    };
    // Air parcels (condos) can share a footprint with their land parcel; keep one feature per APN.
    if (seen.has(apn)) continue;
    seen.set(apn, true);
    out.push({ type: "Feature", id: apn, properties: props, geometry: roundGeometry(f.geometry) });
    const vf = names.filter((n) => VALUE_FIELD.test(n) && !SENSITIVE.test(n));
    if (vf.length) values.push([apn, ...vf.map((n) => p[n] ?? "")]);
  }
  await writeJson(path.join(DATA, "parcels.json"), { type: "FeatureCollection", source: got.source, fields_used: { apn: apnF, use: useF, use_desc: useDescF, units: unitsF, year: yearF, address: addrF, zoning: zoneF }, features: out });
  const valueFields = names.filter((n) => VALUE_FIELD.test(n) && !SENSITIVE.test(n));
  if (valueFields.length) {
    const csv = [["apn", ...valueFields].join(","), ...values.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))];
    await writeFile(path.join(RAW, "parcel_values.csv"), csv.join("\n") + "\n");
  }
  report.parcel_layer = {
    source: got.source, name: got.name, fields_used: { apn: apnF, use: useF, use_desc: useDescF, units: unitsF, year: yearF, address: addrF, zoning: zoneF },
    value_fields: valueFields, inventory,
    use_codes: Object.entries(useCounts).sort((a, b) => b[1] - a[1]).slice(0, 80),
  };
  return { source: got.source, parcels: out.length, without_block: out.filter((f) => !f.properties.block).length, value_fields: valueFields };
}

// ---- run ------------------------------------------------------------------------------------------

await mkdir(RAW, { recursive: true });
await stage("city_limits", buildCityLimits);
await stage("blocks", buildBlocks);
await stage("housing_detail", addHousingDetail);
if (blocks) await writeJson(path.join(DATA, "blocks.json"), blocks);
await stage("boundary_streets", boundaryStreets);
await stage("parcels", buildParcels);
await writeJson(path.join(SOURCES, "build_report.json"), report, true);
console.log(JSON.stringify(report.stages, null, 1));
if (!report.stages.blocks?.ok) process.exit(1);
