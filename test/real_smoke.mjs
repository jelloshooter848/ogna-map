// Smoke check against the real built data (data/): load time, district totals, screenshots.
//   node test/real_smoke.mjs [screenshot-dir]
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv[2] || path.join(ROOT, "test", "screenshots");
const CDN = { "leaflet.js": "node_modules/leaflet/dist/leaflet.js", "leaflet.css": "node_modules/leaflet/dist/leaflet.css", "turf.min.js": "node_modules/@turf/turf/turf.min.js", "html2canvas.min.js": "node_modules/html2canvas/dist/html2canvas.min.js" };
const server = createServer(async (req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (p.endsWith(path.sep)) p += "index.html";
  let body; try { body = await readFile(p); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".html") ? "text/html" : p.endsWith(".css") ? "text/css" : "application/json" });
  res.end(body);
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror:", e));
await page.route(/unpkg\.com|cdn\.jsdelivr\.net/, async (route) => { const f = Object.keys(CDN).find((k) => route.request().url().endsWith(k)); if (!f) return route.abort(); route.fulfill({ body: await readFile(path.join(ROOT, CDN[f])), contentType: f.endsWith(".css") ? "text/css" : "text/javascript" }); });
await page.route(/tile\.openstreetmap/, (r) => r.abort());
await mkdir(SHOTS, { recursive: true });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${server.address().port}/organize/`);
await page.waitForFunction(() => /Ready|Could not/.test(document.getElementById("status").textContent), null, { timeout: 60000 });
console.log("load ms", Date.now() - t0, "|", await page.locator("#status").textContent());
console.log(JSON.stringify(await page.evaluate(() => {
  const s = window.app.stats, d = s.districtStats(), c = s.cityStats();
  const cls = {}; for (const l of window.app.lots.values()) cls[l.cls] = (cls[l.cls] || 0) + 1;
  const pick = (x) => ({ lots: x.lots, pop: Math.round(x.pop), hu: Math.round(x.hu), households: Math.round(x.occ), renters: x.renter_share?.toFixed(3), hh_size: x.hh_size?.toFixed(2), minors: (x.minors / x.pop)?.toFixed(3), acres: Math.round(x.acres), dens: x.density_acre?.toFixed(1), hu_acre: x.hu_acre?.toFixed(1) });
  return { district: pick(d), city: pick(c), classes: cls };
}), null, 1));
await page.screenshot({ path: path.join(SHOTS, "real-1-map.png") });
await page.selectOption("#metricSelect", "use");
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SHOTS, "real-2-landuse.png") });
await page.selectOption("#metricSelect", "density");
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SHOTS, "real-3-density.png") });
await browser.close(); server.close();
