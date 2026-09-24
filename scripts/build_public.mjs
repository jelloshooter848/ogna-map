#!/usr/bin/env node
/**
 * Builds the small files the public site loads, from the committed "Export public" region set and the parcel
 * layer. The public site never loads parcels.json (10 MB) and shows nothing per lot.
 *
 *   data/public/regions.geojson   district, neighborhoods and the unorganized part of the district, as shapes
 *   data/public/addresses.json    house numbers by street, for "Which neighborhood am I in?"
 *   data/public/osm.json          parks, schools, library, transit (OpenStreetMap; kept as is when offline)
 *
 *   node scripts/build_public.mjs [--data test/fixture/] [--no-osm]
 *
 * Runs in the "Build public data" and "Build data" GitHub Actions.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as turf from "@turf/turf";
import { buildIndex } from "../site/address.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const DATA = path.resolve(ROOT, opt("--data") || "data");
const OUT = path.join(DATA, "public");
const OSM = !args.includes("--no-osm");

/** Fields that never reach the public site, whatever the committed file contains. */
export const PRIVATE_FIELDS = ["coordinators", "contact", "notes"];
/** Gaps between lots (streets, alleys) up to about twice this are closed when lots are merged into a shape. */
const CLOSE_METERS = 15;
/** Holes and pieces smaller than this (street crossings, slivers) are dropped from the shapes, in m². */
const MIN_AREA = 3000;

const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const round = (g, d = 5) => turf.truncate(g, { precision: d, coordinates: 2, mutate: true });

export function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "neighborhood";
}

/** Drop small holes and small pieces; returns a Feature or null. */
function tidy(f) {
  if (!f?.geometry) return null;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
  const big = (ring) => turf.area(turf.polygon([ring])) >= MIN_AREA;
  const kept = polys.filter(([outer]) => big(outer)).map(([outer, ...holes]) => [outer, ...holes.filter(big)]);
  if (!kept.length) return null;
  return { type: "Feature", properties: {}, geometry: kept.length === 1 ? { type: "Polygon", coordinates: kept[0] } : { type: "MultiPolygon", coordinates: kept } };
}

/** Merge lot polygons into one shape and close the street gaps between them. */
function mergeLots(features) {
  if (!features.length) return null;
  const merged = features.length === 1 ? features[0] : turf.union(turf.featureCollection(features));
  if (!merged) return null;
  const grown = turf.buffer(merged, CLOSE_METERS, { units: "meters", steps: 4 });
  const closed = turf.buffer(grown, -CLOSE_METERS, { units: "meters", steps: 4 });
  return tidy(turf.simplify(closed || merged, { tolerance: 0.00002, highQuality: false }));
}

/** Region set + parcels -> public GeoJSON. Exported for the tests. */
export function buildRegions(set, parcels) {
  const lotById = new Map(parcels.features.map((f) => [String(f.properties.apn ?? f.id), f]));
  const slugs = new Set();
  const features = [];
  for (const r of set.regions || []) {
    const kind = r.kind === "district" ? "district" : "neighborhood";
    let shape = mergeLots((r.members || []).map((a) => lotById.get(String(a))).filter(Boolean));
    if (!shape && r.seed_polygon?.length > 2) {
      const ring = [...r.seed_polygon];
      if (String(ring[0]) !== String(ring.at(-1))) ring.push(ring[0]);
      shape = turf.polygon([ring]);
    }
    if (!shape) continue;
    let slug = slugify(r.name);
    if (slugs.has(slug)) slug = `${slug}-${r.id}`;
    slugs.add(slug);
    const props = { id: Number(r.id), slug, kind, name: String(r.name || ""), color: r.color || "#2b6cb0" };
    if (r.meets) props.meets = String(r.meets);
    for (const k of PRIVATE_FIELDS) delete props[k];
    features.push(round({ type: "Feature", properties: props, geometry: shape.geometry }));
  }
  // The part of the district no neighborhood covers yet: shown on the site as an invitation.
  const district = features.find((f) => f.properties.kind === "district");
  const hoods = features.filter((f) => f.properties.kind === "neighborhood");
  if (district) {
    let open = district;
    if (hoods.length) {
      const covered = hoods.length === 1 ? hoods[0] : turf.union(turf.featureCollection(hoods));
      open = covered ? tidy(turf.difference(turf.featureCollection([district, covered]))) : district;
    }
    if (open) features.push(round({ type: "Feature", properties: { kind: "unorganized" }, geometry: open.geometry }));
  }
  return { type: "FeatureCollection", name: String(set.name || "Oldtown Gilroy"), features };
}

/** Parcels -> address index (house numbers by street, one point inside each lot). */
export function buildAddresses(parcels) {
  const rows = [];
  for (const f of parcels.features) {
    const a = f.properties.addr;
    if (!a || !f.geometry) continue;
    const [lng, lat] = turf.pointOnFeature(f).geometry.coordinates;
    rows.push([a, Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  }
  return buildIndex(rows);
}

const OSM_QUERY = (b) => `[out:json][timeout:90];(
nwr["leisure"="park"](${b});nwr["leisure"="playground"](${b});
nwr["amenity"="school"](${b});nwr["amenity"="library"](${b});nwr["amenity"="community_centre"](${b});
nwr["highway"="bus_stop"](${b});nwr["railway"="station"](${b});nwr["public_transport"="station"](${b});
);out center tags;`;

function osmCategory(t) {
  if (t.amenity === "library") return "library";
  if (t.amenity === "school") return "school";
  if (t.amenity === "community_centre") return "community";
  if (t.leisure === "park" || t.leisure === "playground") return "park";
  if (t.highway === "bus_stop" || t.railway === "station" || t.public_transport === "station") return "transit";
  return null;
}

async function buildOsm(regions) {
  const district = regions.features.find((f) => f.properties.kind === "district");
  if (!district) return null;
  const [w, s, e, n] = turf.bbox(district);
  const pad = 0.004;
  const bbox = [s - pad, w - pad, n + pad, e + pad].map((v) => v.toFixed(5)).join(",");
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST", body: new URLSearchParams({ data: OSM_QUERY(bbox) }),
    headers: { "user-agent": "ogna-map public build (github actions)" },
  });
  if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
  const seen = new Set();
  const places = [];
  for (const el of (await r.json()).elements || []) {
    const t = el.tags || {}, cat = osmCategory(t);
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (!cat || lat == null) continue;
    if (cat !== "transit" && !t.name) continue;
    const key = `${cat}|${t.name || ""}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ cat, name: t.name || "", ...(t["name:es"] ? { name_es: t["name:es"] } : {}), lat: +lat.toFixed(5), lng: +lng.toFixed(5), osm: `${el.type}/${el.id}` });
  }
  return { source: "© OpenStreetMap contributors (ODbL)", built_at: new Date().toISOString(), places };
}

async function main() {
  const regionFile = (await exists(path.join(DATA, "regions", "public.json")))
    ? path.join(DATA, "regions", "public.json") : path.join(ROOT, "data", "regions", "oldtown.json");
  const [set, parcels] = await Promise.all([readJson(regionFile), readJson(path.join(DATA, "parcels.json"))]);
  await mkdir(OUT, { recursive: true });

  const regions = buildRegions(set, parcels);
  regions.built_at = new Date().toISOString();
  await writeFile(path.join(OUT, "regions.geojson"), JSON.stringify(regions));
  const addresses = buildAddresses(parcels);
  await writeFile(path.join(OUT, "addresses.json"), JSON.stringify(addresses));
  const counts = { regions: regions.features.length, streets: Object.keys(addresses.streets).length };

  if (OSM) {
    try {
      const osm = await buildOsm(regions);
      if (osm) { await writeFile(path.join(OUT, "osm.json"), JSON.stringify(osm)); counts.osm_places = osm.places.length; }
    } catch (e) { console.warn(`OpenStreetMap places not updated: ${e.message}`); }
  }
  console.log(`public data from ${path.relative(ROOT, regionFile)} → ${path.relative(ROOT, OUT)}`, counts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
