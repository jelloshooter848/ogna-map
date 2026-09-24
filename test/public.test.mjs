// Public site model: the public data build, address search and content rules, on the synthetic fixture.
//   node scripts/make_fixture.mjs  (npm test runs it first)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildRegions, buildAddresses, slugify, PRIVATE_FIELDS } from "../scripts/build_public.mjs";
import { parseAddress, normalizeStreet, findAddress, suggest } from "../site/address.js";
import { approved, localized, upcoming, safeUrl } from "../site/content.js";
import { inGeometry } from "../js/geo.js";

const FIX = new URL("./fixture/", import.meta.url);
if (!existsSync(new URL("parcels.json", FIX))) execFileSync("node", [new URL("../scripts/make_fixture.mjs", import.meta.url).pathname]);
const parcels = JSON.parse(readFileSync(new URL("parcels.json", FIX)));
const set = JSON.parse(readFileSync(new URL("regions/public.json", FIX)));
const regions = buildRegions(set, parcels);
const index = buildAddresses(parcels);
const at = (addr) => { const h = findAddress(index, addr); return h && regions.features.filter((f) => inGeometry([h.lng, h.lat], f.geometry)).map((f) => (f.properties.kind === "neighborhood" ? f.properties.slug : f.properties.kind)); };

test("public regions carry no private fields, lot lists or APNs", () => {
  const text = JSON.stringify(regions);
  for (const k of [...PRIVATE_FIELDS, "members", "apn"]) assert.ok(!text.includes(`"${k}"`), k);
  assert.ok(!text.includes("pat@example.org") && !text.includes("Pat Example") && !text.includes("private note"));
  assert.ok(!/"\d{8}"/.test(text), "no APN-like strings");
  const kinds = regions.features.map((f) => f.properties.kind);
  assert.deepEqual(kinds, ["district", "neighborhood", "neighborhood", "unorganized"]);
  assert.equal(regions.features[1].properties.slug, "church-street");
  assert.equal(regions.features[1].properties.meets, "First Tuesday, 7 pm");
});

test("addresses resolve to the right neighborhoods, overlaps included", () => {
  assert.deepEqual(at("281 Kern Ave, Gilroy, CA 95020"), ["district", "church-street"]);
  assert.deepEqual(at("301 Lewis Street"), ["district", "church-street", "eigleberry"]);
  assert.deepEqual(at("341 West Sixth Street"), ["district", "eigleberry"]);
  assert.deepEqual(at("301 Forest St"), ["district", "unorganized"], "in Oldtown, no group");
  assert.deepEqual(at("101 Church St"), [], "outside Oldtown");
  assert.equal(findAddress(index, "999999 Nowhere Rd"), null);
});

test("address parsing and suggestions", () => {
  assert.deepEqual(parseAddress("7351 Rosanna Street #B"), { number: 7351, street: "ROSANNA ST" });
  assert.deepEqual(parseAddress("350 w. sixth st., Gilroy CA"), { number: 350, street: "W 6TH ST" });
  assert.equal(normalizeStreet("Santa Teresa Boulevard"), "SANTA TERESA BL");
  const near = findAddress(index, "295 Kern Av");
  assert.ok(near && !near.exact && /KERN AV/.test(near.label), "nearest number stands in");
  assert.ok(findAddress(index, "281 Kern").exact, "suffix optional");
  assert.ok(suggest(index, "28 Ke").every((s) => /^28\d* KERN AV$/.test(s)));
});

test("content rules: approval, Spanish fallback, upcoming events, safe links", () => {
  assert.equal(approved([{ approved: true }, { approved: "TRUE" }, { approved: "x" }, { approved: false }, {}]).length, 3);
  assert.equal(approved([{}, { approved: false }], { optional: true }).length, 1);
  assert.deepEqual(localized({ title_en: "Hi", title_es: "Hola" }, "title", "es"), { text: "Hola", fallback: false });
  assert.deepEqual(localized({ title_en: "Hi" }, "title", "es"), { text: "Hi", fallback: true });
  assert.deepEqual(localized({ title_en: "Hi", title_es: "Hola" }, "title", "en"), { text: "Hi", fallback: false });
  const ev = upcoming([{ date: "2026-10-02", approved: true }, { date: "2026-09-01", approved: true }, { date: "2026-10-01", approved: true }, { date: "2026-10-03" }], "2026-09-24");
  assert.deepEqual(ev.map((e) => e.date), ["2026-10-01", "2026-10-02"]);
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl(" https://x.org "), "https://x.org");
  assert.equal(slugify("Calle Ñandú / 5th"), "calle-nandu-5th");
});

test("a wrong street suffix still finds the exact house number", () => {
  const idx = { streets: { "MONTEREY RD": [[7243, 1, 1]], "MONTEREY ST": [[7250, 2, 2]] } };
  assert.deepEqual(findAddress(idx, "7250 Monterey Road"), { lng: 2, lat: 2, label: "7250 MONTEREY ST", exact: true });
  assert.equal(findAddress(idx, "7244 Monterey Rd").label, "7243 MONTEREY RD");
});
