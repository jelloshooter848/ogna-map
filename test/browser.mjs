#!/usr/bin/env node
// End-to-end check in headless Chromium against the synthetic fixture:
//   node scripts/make_fixture.mjs && node test/browser.mjs [screenshot-dir]
// CDN scripts are served from node_modules and basemap tiles are skipped, so it runs offline.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv[2] || path.join(ROOT, "test", "screenshots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
const CDN = {
  "leaflet.js": "node_modules/leaflet/dist/leaflet.js",
  "leaflet.css": "node_modules/leaflet/dist/leaflet.css",
  "turf.min.js": "node_modules/@turf/turf/turf.min.js",
  "html2canvas.min.js": "node_modules/html2canvas/dist/html2canvas.min.js",
};

const server = createServer(async (req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (p.endsWith(path.sep)) p += "index.html";
  let body;
  try { body = await readFile(p); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  res.end(body);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/tile|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.route(/unpkg\.com|cdn\.jsdelivr\.net/, async (route) => {
  const f = Object.keys(CDN).find((k) => route.request().url().endsWith(k));
  if (!f) return route.abort();
  route.fulfill({ body: await readFile(path.join(ROOT, CDN[f])), contentType: f.endsWith(".css") ? "text/css" : "text/javascript" });
});
await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
await mkdir(SHOTS, { recursive: true });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
const ev = (fn, arg) => page.evaluate(fn, arg);

try {
  await page.goto(`${base}?data=test/fixture/`);
  await page.waitForFunction(() => /Ready/.test(document.getElementById("status").textContent), null, { timeout: 30000 });
  const lotCount = await ev(() => window.app.lots.size);
  assert.equal(lotCount, 6264);
  const district = await ev(() => window.app.membersOf(window.app.districtId()).size);
  assert.ok(district > 1000, `district seeded from polygon: ${district} lots`);
  await shot("1-map");

  // Create two overlapping neighborhoods: one by area selection, one by clicks.
  await page.click("#editBtn");
  await page.click("#newRegionBtn");
  await page.fill("#newRegionName", "Church Street");
  await page.click("#createRegionBtn");
  const box = await page.locator("#map").boundingBox();
  const pt = (lat, lng) => ev(([a, b]) => { const p = window.app.map.latLngToContainerPoint([a, b]); return [p.x, p.y]; }, [lat, lng]);
  await page.click("#selectAddBtn");
  const corners = [[37.0080, -121.5760], [37.0080, -121.5690], [37.0030, -121.5690], [37.0030, -121.5760]];
  for (const [lat, lng] of corners) { const [x, y] = await pt(lat, lng); await page.mouse.click(box.x + x, box.y + y); await page.waitForTimeout(60); }
  { const [x, y] = await pt(...corners[0]); await page.mouse.click(box.x + x, box.y + y); }
  await page.waitForTimeout(300);
  const church = await ev(() => { const id = window.app.neighborhoodIds()[0]; return window.app.membersOf(id).size; });
  assert.ok(church > 50, `area select added lots: ${church}`);

  await page.click("#newRegionBtn");
  await page.fill("#newRegionName", "Eigleberry");
  await page.click("#createRegionBtn");
  // Bulk-add through the API (same code path as the tool), overlapping the first neighborhood.
  const overlap = await ev(() => {
    const [a, b] = window.app.neighborhoodIds();
    const firstHalf = [...window.app.membersOf(a)].slice(0, 20);
    const more = [...window.app.lots.keys()].filter((k) => window.app.membersOf(window.app.districtId()).has(k)).slice(0, 150);
    window.app.setMembers(b, [...firstHalf, ...more]);
    window.app.rebuildAfterEdit();
    return window.app.stats.cumulativeStats().overlap_lots;
  });
  assert.equal(overlap, 20);
  // Click toggles a single lot.
  const before = await ev(() => window.app.membersOf(window.app.neighborhoodIds()[1]).size);
  const target = await ev(() => [...window.app.lots.keys()].find((k) => !window.app.regionsOf(k).length && window.app.lots.get(k).block));
  await ev((apn) => { window.app.map.setView(window.app.lotCenter(apn), 18, { animate: false }); }, target);
  await page.waitForTimeout(500);
  const mb = await page.locator("#map").boundingBox();
  const [tx, ty] = await ev((apn) => { const p = window.app.map.latLngToContainerPoint(window.app.lotCenter(apn)); return [p.x, p.y]; }, target);
  await page.mouse.click(mb.x + tx, mb.y + ty);
  const after = await ev(() => window.app.membersOf(window.app.neighborhoodIds()[1]).size);
  assert.equal(after, before + 1, "clicking a lot adds it to the active neighborhood");
  await page.click("#resetViewBtn");
  await page.waitForTimeout(400);
  await shot("2-edit");

  // Union stats: combined residents < sum of the two.
  const u = await ev(() => { const s = window.app.stats; const [a, b] = window.app.neighborhoodIds(); return { a: s.regionStats(a).pop, b: s.regionStats(b).pop, u: s.cumulativeStats().pop, cov: s.coverage().pop_share }; });
  assert.ok(u.u < u.a + u.b && u.u > Math.max(u.a, u.b), JSON.stringify(u));
  assert.ok(u.cov > 0 && u.cov < 1);

  // Undo the click, redo it.
  await page.click("#undoBtn");
  assert.equal(await ev(() => window.app.membersOf(window.app.neighborhoodIds()[1]).size), before);
  await page.click("#redoBtn");

  // Metadata + details table.
  await page.click("#presentationBtn");
  await page.locator(".region .rname").nth(1).click();
  await page.selectOption("#details select[data-k=status]", "forming");
  await page.fill("#details input[data-k=contact]", "church-st@example.org");
  await page.locator("#details input[data-k=contact]").dispatchEvent("change");
  assert.equal(await ev(() => window.app.region(window.app.neighborhoodIds()[0]).contact), "church-st@example.org");
  const tableCols = await page.locator("#details table.cmp th").count();
  assert.equal(tableCols, 4, "label + neighborhood + district + Gilroy");
  await shot("3-details");

  // Shading: land use, then coverage, then blocks.
  await page.selectOption("#metricSelect", "use");
  await shot("4-landuse");
  await page.selectOption("#metricSelect", "coverage");
  await page.click("#auditBtn");
  await shot("5-coverage");
  await page.selectOption("#metricSelect", "density");
  await page.check("#unitBlocks");
  await shot("6-blocks-density");
  await page.check("#unitLots");
  await page.selectOption("#metricSelect", "none");

  // Public export leaves out contacts; full export keeps them; import round trip.
  const pub = await ev(() => JSON.stringify(window.app.currentRegionSet({ includePrivate: false })));
  assert.ok(!pub.includes("church-st@example.org"));
  const full = await ev(() => window.app.currentRegionSet());
  const reimported = await ev((p) => { const s = window.app.parseImport(p); window.app.applyImportedSet(s, "test"); return window.app.currentRegionSet(); }, full);
  assert.deepEqual(reimported.regions, full.regions);

  // Tax roll import with an owner column.
  const apns = await ev(() => [...window.app.membersOf(window.app.neighborhoodIds()[0])].slice(0, 40));
  const csv = ["APN,Owner Name,Land Value,Improvement Value,Total Tax", ...apns.map((a, i) => `${a.slice(0, 3)}-${a.slice(3, 5)}-${a.slice(5)},"OWNER ${i}, JR",${200000 + i * 1000},${300000},${5000 + i * 10}`)].join("\n");
  const csvPath = path.join(SHOTS, "fake_roll.csv");
  await writeFile(csvPath, csv);
  await page.click("#taxSection summary");
  await page.setInputFiles("#taxFile", csvPath);
  await page.click("#taxApplyBtn");
  await page.waitForFunction(() => /Tax roll loaded/.test(document.getElementById("status").textContent));
  const tax = await ev(() => { const s = window.app.stats.regionStats(window.app.neighborhoodIds()[0]); return { tax: s.tax, lots: s.tax_lots, src: s.tax_source }; });
  assert.equal(tax.lots, 40);
  assert.equal(tax.src, "roll");
  const stored = await ev(() => new Promise((res) => { const r = indexedDB.open("ogna_map"); r.onsuccess = () => { const g = r.result.transaction("private").objectStore("private").get("taxroll"); g.onsuccess = () => res(JSON.stringify(g.result)); }; }));
  assert.ok(!stored.includes("OWNER"), "owner names are not stored");
  await page.selectOption("#metricSelect", "tax_sqft");
  await shot("7-tax");
  await page.selectOption("#metricSelect", "none");

  // Browser save survives a reload; tax roll too.
  await page.click("#editBtn");
  await page.click("#saveBtn");
  await page.reload();
  await page.waitForFunction(() => /Ready/.test(document.getElementById("status").textContent), null, { timeout: 30000 });
  assert.equal(await ev(() => window.app.neighborhoodIds().length), 2);
  assert.match(await page.locator("#taxStatus").textContent(), /fake_roll\.csv/);

  // Neighborhood sheet export (tiles are blocked here, so only the overlay renders).
  await page.locator(".region .rname").nth(1).click();
  await page.click("#exportSection summary");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#exportSheetBtn")]);
  await dl.saveAs(path.join(SHOTS, "8-sheet.png"));
  await shot("9-final");

  assert.deepEqual(errors, []);
  console.log("browser test passed; screenshots in", path.relative(process.cwd(), SHOTS));
} catch (e) {
  await shot("failure").catch(() => {});
  console.error("errors:", errors);
  throw e;
} finally {
  await browser.close();
  server.close();
}
