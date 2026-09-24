// Address matching for "Which neighborhood am I in?". No DOM: the build script uses it to write the index,
// the public site to search it. Addresses follow the County parcel layer's style, e.g. "7351 ROSANNA ST".

const SUFFIX = {
  STREET: "ST", STR: "ST", AVENUE: "AV", AVE: "AV", DRIVE: "DR", WAY: "WY", COURT: "CT", PLACE: "PL",
  LANE: "LN", ROAD: "RD", CIRCLE: "CL", CIR: "CL", TERRACE: "TR", TER: "TR", PARKWAY: "PY", PKWY: "PY",
  HIGHWAY: "HY", HWY: "HY", BOULEVARD: "BL", BLVD: "BL",
};
const DIRECTION = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W" };
const ORDINAL = {
  FIRST: "1ST", SECOND: "2ND", THIRD: "3RD", FOURTH: "4TH", FIFTH: "5TH", SIXTH: "6TH", SEVENTH: "7TH",
  EIGHTH: "8TH", NINTH: "9TH", TENTH: "10TH",
};
// Words people add after the street that the parcel layer leaves out.
const TAIL = /\b(GILROY|CALIFORNIA|CA|USA|9502\d)\b.*$/;

/** Normalize one street name: "West Sixth Street" -> "W 6TH ST". */
export function normalizeStreet(s) {
  return String(s || "").toUpperCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean)
    .map((w) => SUFFIX[w] || DIRECTION[w] || ORDINAL[w] || w).join(" ");
}

/**
 * Split an address into { number, street }. Units ("#A", "Apt 3"), the city, state and ZIP are dropped.
 * Returns null when there is no street.
 */
export function parseAddress(raw) {
  let s = String(raw || "").toUpperCase().split(",")[0];
  s = s.replace(/#.*$/, "").replace(/\b(APT|UNIT|STE|SUITE)\b.*$/, "").replace(TAIL, "").trim();
  const m = s.match(/^(\d+)[A-Z]?\s+(.*)$/);
  const street = normalizeStreet(m ? m[2] : s);
  if (!street) return null;
  return { number: m ? Number(m[1]) : null, street };
}

/**
 * Build the compact index from [address, lng, lat] rows: { streets: { "CHURCH ST": [[number, lng, lat], …] } },
 * one point per house number, numbers sorted.
 */
export function buildIndex(rows) {
  const streets = {};
  for (const [addr, lng, lat] of rows) {
    const p = parseAddress(addr);
    if (!p || p.number == null) continue;
    const list = (streets[p.street] ||= []);
    if (!list.some(([n]) => n === p.number)) list.push([p.number, lng, lat]);
  }
  for (const list of Object.values(streets)) list.sort((a, b) => a[0] - b[0]);
  return { streets };
}

const SUFFIXES = new Set(Object.values(SUFFIX));
const baseName = (street) => street.split(" ").filter((w, i, a) => !(i === a.length - 1 && a.length > 1 && SUFFIXES.has(w))).join(" ");

/**
 * Streets matching what was typed: the exact name, then the same name with another suffix ("Monterey Rd" also
 * finds "MONTEREY ST"), then names that start with it, then names containing it.
 */
export function matchStreets(index, street) {
  const names = Object.keys(index.streets);
  const base = baseName(street);
  const sameBase = names.filter((n) => n !== street && baseName(n) === base);
  if (index.streets[street] || sameBase.length) return [...(index.streets[street] ? [street] : []), ...sameBase];
  const starts = names.filter((n) => n.startsWith(street) || n.replace(/^[NSEW] /, "").startsWith(street));
  return starts.length ? starts : names.filter((n) => n.includes(street));
}

/**
 * Find an address. Returns { lng, lat, label, exact } or null. When the house number isn't on file, the nearest
 * number on the same street (within 100) stands in, with exact: false.
 */
export function findAddress(index, raw) {
  const p = parseAddress(raw);
  if (!p || p.number == null) return null;
  let best = null;
  for (const name of matchStreets(index, p.street).slice(0, 6)) {
    for (const [n, lng, lat] of index.streets[name]) {
      const d = Math.abs(n - p.number);
      if (d <= 100 && (!best || d < best.d)) best = { d, lng, lat, label: `${n} ${name}` };
    }
  }
  return best && { lng: best.lng, lat: best.lat, label: best.label, exact: best.d === 0 };
}

/** Up to `limit` suggestions for a partly typed address. */
export function suggest(index, raw, limit = 6) {
  const p = parseAddress(raw);
  if (!p || p.street.length < 2) return [];
  const out = [];
  for (const name of matchStreets(index, p.street)) {
    const list = index.streets[name];
    if (p.number == null) out.push(name);
    else for (const [n] of list) if (String(n).startsWith(String(p.number))) out.push(`${n} ${name}`);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
