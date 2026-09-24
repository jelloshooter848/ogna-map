#!/usr/bin/env node
// End-to-end check of the public site at phone size, on the synthetic fixture:
//   node scripts/make_fixture.mjs && node scripts/build_public.mjs --data test/fixture/ --no-osm && node test/public_browser.mjs [screenshot-dir]
// Leaflet is served from node_modules and basemap tiles are skipped, so it runs offline.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv[2] || path.join(ROOT, "test", "screenshots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".geojson": "application/json", ".css": "text/css" };
const CDN = { "leaflet.js": "node_modules/leaflet/dist/leaflet.js", "leaflet.css": "node_modules/leaflet/dist/leaflet.css" };

const server = createServer(async (req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (p.endsWith(path.sep)) p += "index.html";
  let body;
  try { body = await readFile(p); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  res.end(body);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const FIX = "data=test/fixture/&content=test/fixture/content/";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US" });
const page = await context.newPage();
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
const shot = (n, full = false) => page.screenshot({ path: path.join(SHOTS, `public-${n}.png`), fullPage: full });
const text = () => page.evaluate(() => document.body.innerText);
/** Nothing demographic or per lot, ever (hand-off §5). */
async function assertNoDemographics() {
  const t = await text();
  const bad = t.match(/resident|renter|household|density|per acre|APN|parcel|property tax|assessed|year built|sale year|population/i);
  assert.equal(bad, null, `forbidden word on page: ${bad}`);
}
async function search(addr) {
  await page.fill("#addr", addr);
  await page.click("#findForm button[type=submit]");
  await page.waitForFunction(() => !document.getElementById("answer").hidden && document.getElementById("answer").textContent.trim());
  return page.locator("#answer").innerText();
}

try {
  // Home, English.
  await page.goto(`${base}?${FIX}&lang=en`);
  await page.waitForSelector("#addr");
  await page.waitForSelector(".leaflet-interactive");
  assert.equal(await page.locator("h1").first().innerText(), "Which neighborhood am I in?");
  await shot("1-home");

  let a = await search("281 Kern Ave, Gilroy");
  assert.match(a, /You're in:/);
  assert.match(a, /Church Street/);
  assert.doesNotMatch(a, /Eigleberry/);
  await page.waitForTimeout(700); // let the map finish zooming
  await shot("2-found");

  a = await search("301 Lewis Street");
  assert.match(a, /Church Street/);
  assert.match(a, /Eigleberry/, "overlapping neighborhoods both listed");

  a = await search("301 Forest St");
  assert.match(a, /no neighborhood group here yet/);
  assert.equal(await page.locator("#answer a[href='https://example.org/start']").count(), 1, "start-a-group link");
  await shot("3-no-group");

  a = await search("101 Church St");
  assert.match(a, /outside Oldtown/);
  a = await search("Church St");
  assert.match(a, /house number/);
  a = await search("12345 Nowhere Rd");
  assert.match(a, /couldn't find/);

  // Tapping the map looks the point up too.
  const box = await page.locator("#map").boundingBox();
  await page.evaluate(() => { document.getElementById("answer").hidden = true; });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => !document.getElementById("answer").hidden);

  // Lists: approved content only, past events hidden.
  const body = await text();
  assert.match(body, /Church Street cleanup/);
  assert.match(body, /Oldtown potluck/);
  assert.doesNotMatch(body, /Past event|Unapproved event|Hidden Shop|not approved/);
  assert.match(body, /Gilroy by the numbers/);
  assert.match(body, /Crime dashboard/);
  assert.match(body, /Civic Center Master Plan/);
  assert.equal(await page.locator("#groups li").count(), 2);
  assert.equal(await page.locator(".pin.event").count(), 2, "events without coordinates get no pin");
  assert.ok(await page.locator("input[data-layer=parks]").isChecked(), "parks shown by default");
  assert.ok(!(await page.locator("input[data-layer=schools]").isChecked()));
  await page.check("input[data-layer=schools]");
  assert.ok(await page.locator(".pin.school").count() > 0, "school pins appear");
  assert.equal(await page.locator("footer a[href='organize/']").count(), 1);
  await assertNoDemographics();
  await shot("4-home-full", true);

  // Neighborhood page.
  await page.goto(`${base}?${FIX}&lang=en&n=church-street`);
  await page.waitForSelector(".hoodhead h1");
  assert.equal(await page.locator(".hoodhead h1").innerText(), "Church Street");
  const hood = await text();
  assert.match(hood, /Neighbors along Church Street/);
  assert.match(hood, /Meets: First Tuesday, 7 pm/);
  assert.match(hood, /Church Street sidewalk repair/, "nearby projects for this neighborhood");
  assert.match(hood, /Church Street cleanup/);
  assert.doesNotMatch(hood, /Oldtown potluck/, "only this neighborhood's events");
  assert.match(hood, /Your City Council district/);
  assert.equal(await page.locator("a.btn[href='https://example.org/join-church']").count(), 1);
  assert.equal(await page.locator("a.btn[href='https://seeclickfix.com/gilroy']").count(), 1);
  await assertNoDemographics();
  await shot("5-neighborhood", true);
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".hoodhead .actions").isVisible(), false, "buttons hidden when printed");
  await shot("6-print", true);
  await page.emulateMedia({ media: "screen" });

  // Spanish.
  await page.goto(`${base}?${FIX}&lang=es`);
  await page.waitForSelector("#addr");
  assert.equal(await page.locator("h1").first().innerText(), "¿En qué vecindario estoy?");
  assert.equal(await page.locator("html").getAttribute("lang"), "es");
  a = await search("281 Kern Ave");
  assert.match(a, /Usted está en:/);
  assert.match(await text(), /\(en inglés\)/);
  await shot("7-es");
  await page.goto(`${base}?${FIX}&lang=es&n=eigleberry`);
  await page.waitForSelector(".hoodhead h1");
  assert.match(await text(), /Falta traducción/, "English fallback is flagged");
  await page.goto(`${base}?${FIX}&lang=es&n=church-street`);
  await page.waitForSelector(".hoodhead h1");
  assert.match(await text(), /Se reúne: Primer martes, 7 pm/);
  // The language choice is remembered.
  await page.goto(`${base}?${FIX}`);
  await page.waitForSelector("#addr");
  assert.equal(await page.locator("html").getAttribute("lang"), "es");

  // Unknown neighborhood, then data not built yet.
  await page.goto(`${base}?${FIX}&lang=en&n=nowhere`);
  await page.waitForSelector("main .card");
  assert.match(await text(), /couldn't find that neighborhood/);
  await page.goto(`${base}?data=test/missing/&lang=en`);
  await page.waitForSelector("main .card");
  assert.match(await text(), /being updated/);

  assert.deepEqual(errors, []);
  console.log(`public browser test passed; screenshots in ${path.relative(process.cwd(), SHOTS) || "."}`);
} catch (e) {
  await shot("failure", true).catch(() => {});
  console.error(e);
  if (errors.length) console.error("page errors:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
