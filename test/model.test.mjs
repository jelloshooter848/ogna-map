// Model tests: allocation, overlapping membership, union stats, undo/redo, region-set round trip, tax.
// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, lots, lotTax, setTaxRoll, clearTaxRoll, classifyLot } from "../js/units.js";
import * as S from "../js/state.js";
import { regionStats, cumulativeStats, coverage, cityStats, statsForLots } from "../js/stats.js";
import { EST_TAX_RATE } from "../js/config.js";

const sq = (x, y) => ({ type: "Polygon", coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] });
const lot = (apn, block, use_desc, sqft = 5000, extra = {}) => ({ type: "Feature", id: apn, properties: { apn, block, sqft, use_desc, ...extra }, geometry: sq(0, 0) });
const data = {
  blocks: { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "B1", pop: 30, hu: 10, occ: 9, rent: 6, adults: 20, land_acres: 4, in_city: 1 }, geometry: sq(0, 0) },
    { type: "Feature", properties: { id: "B2", pop: 12, hu: 4, occ: 4, rent: 1, adults: 9, land_acres: 2, in_city: 1 }, geometry: sq(1, 0) },
    { type: "Feature", properties: { id: "B3", pop: 100, hu: 40, occ: 38, rent: 10, adults: 70, land_acres: 20, in_city: 1 }, geometry: sq(5, 5) },
  ] },
  parcels: { type: "FeatureCollection", features: [
    lot("A1", "B1", "SINGLE FAMILY RESIDENCE"), lot("A2", "B1", "DUPLEX"), lot("A3", "B1", "COMMERCIAL STORE"),
    lot("A4", "B1", "APARTMENTS", 5000, { units: 7 }),
    lot("A5", "B2", "OFFICE"), lot("A6", "B2", "RETAIL", 15000), // block with people but no residential lot
  ] },
};

function fresh() {
  loadData(data);
  clearTaxRoll();
  S.applyRegionSet({ name: "t", regions: [
    { id: 1, kind: "district", name: "Oldtown", members: ["A1", "A2", "A3", "A4", "A5", "A6"] },
    { id: 2, name: "North", members: ["A1", "A2"] },
    { id: 3, name: "East", members: ["A2", "A4"] },
  ] }, { asBaseline: true });
}

test("classification", () => {
  assert.equal(classifyLot({ use_desc: "SINGLE FAMILY RESIDENCE" }), "single");
  assert.equal(classifyLot({ use: "02" }), "duplex");
  assert.equal(classifyLot({ use: "10", use_desc: "COMMERCIAL" }), "nonresidential");
  assert.equal(classifyLot({}), "unknown");
  assert.equal(classifyLot({ use: "16" }), "nonresidential", "no prefix matching: 16 is not 1");
  assert.equal(classifyLot({ use: "01" }), "single");
  assert.equal(classifyLot({ use: "6" }), "condo");
  assert.equal(classifyLot({ use: "1", ptype: "Common Area" }), "nonresidential");
});

test("block counts are spread over residential lots and sum back to the block", () => {
  fresh();
  // weights in B1: single 1, duplex 2, commercial 0, apartments 7 (recorded units) → 10
  assert.equal(lots.get("A1").est.pop, 3);
  assert.equal(lots.get("A2").est.pop, 6);
  assert.equal(lots.get("A3").est.pop, 0);
  assert.equal(lots.get("A4").est.pop, 21);
  // B2 has people but no residential lots: spread by lot area (5000 : 15000)
  assert.equal(lots.get("A5").est.pop, 3);
  assert.equal(lots.get("A6").est.pop, 9);
  const all = statsForLots(["A1", "A2", "A3", "A4", "A5", "A6"]);
  assert.equal(all.pop, 42);
  assert.equal(all.hu, 14);
  assert.ok(Math.abs(all.acres - 6) < 1e-9, "gross acres of whole blocks");
});

test("overlapping neighborhoods: a shared lot counts once in combined totals", () => {
  fresh();
  assert.deepEqual(S.regionsOf("A2"), ["1", "2", "3"]);
  assert.equal(S.neighborhoodCount("A2"), 2);
  assert.equal(regionStats(2).pop, 9);
  assert.equal(regionStats(3).pop, 27);
  const c = cumulativeStats();
  assert.equal(c.pop, 30, "A1+A2+A4, A2 once");
  assert.equal(c.overlap_lots, 1);
  const cov = coverage();
  assert.equal(cov.covered_lots, 3);
  assert.equal(cov.district_lots, 6);
  assert.ok(Math.abs(cov.pop_share - 30 / 42) < 1e-9);
});

test("toggle, bulk add, undo and redo", () => {
  fresh();
  assert.equal(S.toggleMember("A3", 2), true);
  assert.equal(regionStats(2).lots, 3);
  assert.equal(S.setMembers(2, ["A3", "A4", "A5"], true), 2, "A3 already a member");
  assert.equal(regionStats(2).lots, 5);
  assert.ok(S.undo());
  assert.equal(regionStats(2).lots, 3);
  assert.ok(S.undo());
  assert.equal(regionStats(2).lots, 2);
  assert.equal(S.state.dirty, false, "back at baseline");
  assert.ok(S.redo());
  assert.equal(regionStats(2).lots, 3);
  assert.equal(S.toggleMember("A3", 2), false, "second toggle removes");
});

test("region set round trip and private fields", () => {
  fresh();
  const id = S.createRegion("Church St");
  S.setMembers(id, ["A1", "A3"]);
  S.updateRegion(id, { status: "forming", coordinators: "Pat", contact: "pat@example.org", notes: "speeding" });
  const full = S.toRegionSet();
  const pub = S.toRegionSet({ includePrivate: false });
  const r = full.regions.find((x) => x.id === id), p = pub.regions.find((x) => x.id === id);
  assert.equal(r.contact, "pat@example.org");
  assert.equal(p.contact, undefined);
  assert.equal(p.coordinators, undefined);
  assert.equal(p.notes, "speeding");
  S.applyRegionSet(JSON.parse(JSON.stringify(full)));
  assert.deepEqual(S.toRegionSet(), full);
  assert.equal(S.region(id).status, "forming");
});

test("tax: roll amount wins, values are estimated, missing is null", () => {
  fresh();
  assert.equal(lotTax("A1").amount, null);
  setTaxRoll(new Map([["A1", { tax: 4321 }], ["A2", { land: 200000, impr: 300000, exempt: 7000 }]]), { name: "x" });
  assert.deepEqual(lotTax("A1"), { amount: 4321, source: "roll", value: null });
  assert.equal(lotTax("A2").source, "est");
  assert.ok(Math.abs(lotTax("A2").amount - 493000 * EST_TAX_RATE) < 1e-6);
  const s = regionStats(2);
  assert.equal(s.tax_source, "mixed");
  assert.ok(s.tax_complete);
  assert.ok(Math.abs(s.tax - (4321 + 493000 * EST_TAX_RATE)) < 1e-6);
});

test("city benchmark sums every in-city block", () => {
  fresh();
  const c = cityStats();
  assert.equal(c.pop, 142);
  assert.equal(c.acres, 26);
});

test("tax roll CSV: quoted fields, owner columns discarded, duplicate APNs summed", async () => {
  const { parseCsv, guessMapping, buildRoll } = await import("../js/taxroll.js");
  const csv = 'APN,Owner Name,Mailing Address,Land Value,Improvement Value,Exemptions,Total Tax\r\n' +
    '841-12-003,"SMITH, JOHN","1 Main St, Gilroy","$200,000",300000,7000,"5,432.10"\r\n' +
    '84112003,"SMITH, JOHN",,,,,100\n' +
    '841-12-004,"DOE ""JJ"" JANE",,150000,0,,\n';
  const parsed = parseCsv(csv);
  assert.equal(parsed.rows.length, 3);
  const m = guessMapping(parsed.header);
  assert.equal(parsed.header[m.apn], "APN");
  assert.equal(parsed.header[m.tax], "Total Tax");
  assert.equal(parsed.header[m.land], "Land Value");
  assert.equal(parsed.header[m.impr], "Improvement Value");
  assert.equal(parsed.header[m.exempt], "Exemptions");
  assert.equal(m.net, -1);
  const { roll, meta } = buildRoll(parsed, m, "roll.csv");
  assert.equal(roll.size, 2);
  assert.deepEqual(roll.get("84112003"), { tax: 5532.1, land: 200000, impr: 300000, exempt: 7000 });
  assert.deepEqual(roll.get("84112004"), { land: 150000, impr: 0 });
  assert.equal(meta.discarded_columns, 2);
  assert.ok(!JSON.stringify([...roll]).includes("SMITH"));
});
