// Public site: "Which neighborhood am I in?", neighborhood pages (?n=slug), events, places and links.
// Read-only. Shows no demographic or per-lot data: shapes come from data/public/, text from content/.
import { ROOT_URL, DATA_OVERRIDE } from "../js/config.js";
import { inGeometry } from "../js/geo.js";
import { findAddress, suggest, parseAddress } from "./address.js";
import { approved, localized, upcoming, safeUrl, todayIso } from "./content.js";
import { pickLang, rememberLang, translator, fmtDate } from "./i18n.js";
import { createMap } from "./map.js";

const params = new URLSearchParams(location.search);
const lang = pickLang();
const t = translator(lang);
rememberLang(lang);
document.documentElement.lang = lang;

const PUBLIC_BASE = new URL(`${DATA_OVERRIDE || "data/"}public/`, ROOT_URL).href;
const CONTENT_BASE = new URL(params.get("content") ? params.get("content").replace(/\/?$/, "/") : "content/", ROOT_URL).href;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (sel, root = document) => root.querySelector(sel);

/** A link to another page of this site, keeping the test data folders and the language. */
function pageHref(extra = {}) {
  const q = new URLSearchParams();
  for (const k of ["data", "content"]) if (params.get(k)) q.set(k, params.get(k));
  if (params.get("lang")) q.set("lang", lang);
  for (const [k, v] of Object.entries(extra)) if (v != null) q.set(k, v);
  const s = q.toString();
  return `./${s ? `?${s}` : ""}`;
}
const hoodHref = (f) => pageHref({ n: f.properties.slug });

async function getJson(url, fallback) {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) return fallback;
    return await r.json();
  } catch { return fallback; }
}

// ---- small renderers --------------------------------------------------------------------------------

function textOf(row, field) {
  const { text, fallback } = localized(row, field, lang);
  if (!text) return "";
  return esc(text) + (fallback ? ` <span class="tn" title="${esc(t("translation_needed"))}">${esc(t("translation_needed"))}</span>` : "");
}

function linkList(rows, { englishOnly = false } = {}) {
  const items = rows.map((r) => {
    const href = safeUrl(r.link);
    if (!href) return "";
    const note = textOf(r, "note");
    const tag = englishOnly && lang === "es" ? ` <span class="muted">${esc(t("english_only"))}</span>` : "";
    return `<li><a href="${esc(href)}" target="_blank" rel="noopener">${textOf(r, "title")}</a>${tag}${note ? `<div class="note">${note}</div>` : ""}</li>`;
  }).join("");
  return items ? `<ul class="links">${items}</ul>` : "";
}

function eventList(events) {
  if (!events.length) return `<p class="muted">${esc(t("events_none"))}</p>`;
  return `<ul class="events">${events.map((e) => {
    const link = safeUrl(e.link);
    const title = textOf(e, "title");
    return `<li><div class="when">${esc(fmtDate(e.date, lang))}${e.time ? ` · ${esc(e.time)}` : ""}</div>
      <div class="what">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${title}</a>` : title}</div>
      ${e.address ? `<div class="note">${esc(e.address)}</div>` : ""}</li>`;
  }).join("")}</ul>`;
}

function section(id, title, body) {
  return body ? `<section class="card" id="${id}"><h2>${esc(title)}</h2>${body}</section>` : "";
}

function button(href, label, cls = "btn") {
  const u = safeUrl(href);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : "";
}

function startButtons(site) {
  return button(site.start_group_link, t("start_group"), "btn primary") + button(site.starter_kit_link, t("starter_kit"));
}

// ---- lookups ----------------------------------------------------------------------------------------

function lookup(regions, lng, lat) {
  const feats = regions?.features || [];
  const hoods = feats.filter((f) => f.properties.kind === "neighborhood" && inGeometry([lng, lat], f.geometry));
  const district = feats.find((f) => f.properties.kind === "district");
  return { hoods, inDistrict: Boolean(district && inGeometry([lng, lat], district.geometry)) };
}

function answerHtml(regions, site, lng, lat, note = "") {
  const { hoods, inDistrict } = lookup(regions, lng, lat);
  const pre = note ? `<p class="muted">${esc(note)}</p>` : "";
  if (hoods.length) {
    const items = hoods.map((f) => `<li><span class="sw" style="background:${esc(f.properties.color)}"></span>
      <a href="${esc(hoodHref(f))}">${esc(f.properties.name)}</a>${f.properties.meets ? ` <span class="muted">· ${esc(t("meets", { when: f.properties.meets }))}</span>` : ""}</li>`).join("");
    return `${pre}<p><b>${esc(t("in_hoods"))}</b></p><ul class="hoods">${items}</ul>`;
  }
  if (inDistrict) return `${pre}<p><b>${esc(t("no_group"))}</b></p><p>${esc(t("no_group_cta"))}</p><div class="actions">${startButtons(site)}</div>`;
  return `${pre}<p>${esc(t("outside"))}</p>`;
}

/** A coordinate from content, or null when blank or not a number (blank cells must not land at 0,0). */
function coord(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---- pages ------------------------------------------------------------------------------------------

function addLayers(m, osm, events, places) {
  for (const p of osm?.places || []) {
    const name = lang === "es" && p.name_es ? p.name_es : p.name;
    m.addPlace(p.cat, p.lat, p.lng, `<b>${esc(name || t("layer_transit"))}</b>`);
  }
  for (const e of events) if (coord(e.lat) != null && coord(e.lng) != null) {
    m.addPlace("event", coord(e.lat), coord(e.lng), `<b>${textOf(e, "title")}</b><br>${esc(fmtDate(e.date, lang))}${e.time ? ` · ${esc(e.time)}` : ""}`);
  }
  for (const p of places) if (coord(p.lat) != null && coord(p.lng) != null) {
    const web = safeUrl(p.website);
    m.addPlace("place", coord(p.lat), coord(p.lng), `<b>${esc(p.name)}</b>${p.description_en || p.description_es ? `<br>${textOf(p, "description")}` : ""}${web ? `<br><a href="${esc(web)}" target="_blank" rel="noopener">${esc(web.replace(/^https?:\/\//, ""))}</a>` : ""}`);
  }
}

function layerChips(m, on = ["parks", "library", "events"]) {
  const keys = [["parks", "layer_parks"], ["schools", "layer_schools"], ["library", "layer_library"], ["transit", "layer_transit"], ["events", "layer_events"], ["places", "layer_places"]]
    .filter(([k]) => m.groups[k] && m.groups[k].getLayers().length);
  const html = keys.map(([k, label]) => `<label class="chip"><input type="checkbox" data-layer="${k}" ${on.includes(k) ? "checked" : ""}> ${esc(t(label))}</label>`).join("");
  for (const [k] of keys) m.show(k, on.includes(k));
  return html;
}

function legend(regions) {
  const hasOpen = regions.features.some((f) => f.properties.kind === "unorganized");
  return `<div class="legend"><span><i class="lg-district"></i>${esc(t("legend_district"))}</span>${hasOpen ? `<span><i class="lg-open"></i>${esc(t("legend_open"))}</span>` : ""}</div>`;
}

function wireChips(root, m) {
  root.querySelectorAll("input[data-layer]").forEach((i) => i.addEventListener("change", () => m.show(i.dataset.layer, i.checked)));
}

function homePage({ regions, site, hoodRows, events, resources, osm, places }) {
  const app = $("#app");
  const hoods = regions.features.filter((f) => f.properties.kind === "neighborhood").sort((a, b) => a.properties.name.localeCompare(b.properties.name));
  const byId = new Map(hoodRows.map((r) => [Number(r.map_id), r]));
  const hoodCards = hoods.length
    ? `<ul class="hoods">${hoods.map((f) => {
      const row = byId.get(f.properties.id);
      const meets = row ? localized(row, "meets", lang).text : "";
      const when = meets || f.properties.meets;
      return `<li><span class="sw" style="background:${esc(f.properties.color)}"></span><a href="${esc(hoodHref(f))}">${esc(f.properties.name)}</a>${when ? ` <span class="muted">· ${esc(t("meets", { when }))}</span>` : ""}</li>`;
    }).join("")}</ul>`
    : `<p>${esc(t("hoods_none"))}</p><div class="actions">${startButtons(site)}</div>`;
  const cat = (c) => resources.filter((r) => r.category === c && !r.neighborhood);
  const projects = cat("projects");

  app.innerHTML = `
    <section class="hero">
      <h1>${esc(t("find_title"))}</h1>
      <p class="muted">${esc(t("find_help"))}</p>
      <form id="findForm" class="find" autocomplete="off" role="search">
        <label class="sr" for="addr">${esc(t("address_label"))}</label>
        <input id="addr" name="addr" type="text" inputmode="text" enterkeyhint="search" placeholder="${esc(t("address_placeholder"))}" list="addrList" autocapitalize="words">
        <datalist id="addrList"></datalist>
        <button class="btn primary" type="submit">${esc(t("find"))}</button>
      </form>
      ${isSecureContext && navigator.geolocation ? `<button id="locateBtn" class="linkbtn" type="button">📍 ${esc(t("locate"))}</button>` : ""}
      <div id="answer" class="answer" hidden></div>
    </section>
    <section class="mapwrap">
      <div id="map" class="map" role="region" aria-label="${esc(t("map_title"))}"></div>
      ${legend(regions)}
      <div class="chips" id="chips"></div>
    </section>
    ${section("groups", t("hoods_title"), hoodCards)}
    ${section("events", t("events_title"), eventList(events))}
    ${section("projects", t("projects_title"), projects.length ? linkList(projects, { englishOnly: true }) + `<p class="small"><a href="https://ourgilroy.com/capital.php" target="_blank" rel="noopener">${esc(t("projects_all"))}</a></p>` : "")}
    ${section("city", t("city_title"), linkList(cat("city")))}
    ${section("vote", t("vote_title"), cat("elections").length ? `<p>${esc(t("vote_intro"))}</p>${linkList(cat("elections"))}` : "")}
    ${section("numbers", t("numbers_title"), cat("numbers").length ? `<p class="muted">${esc(t("numbers_intro"))}</p>${linkList(cat("numbers"), { englishOnly: true })}` : "")}
    ${section("shops", t("community_title"), linkList(cat("community")))}
    ${section("about", t("about_title"), `<p>${esc(t("about_body"))}</p>`)}`;

  const answer = $("#answer");
  const show = (html) => { answer.innerHTML = html; answer.hidden = false; };
  const m = createMap($("#map"), { regions, t, hrefFor: hoodHref, onPick: (lat, lng) => { m.mark(lat, lng); show(answerHtml(regions, site, lng, lat)); } });
  addLayers(m, osm, events, places);
  $("#chips").innerHTML = layerChips(m);
  wireChips($("#chips"), m);

  // Address search. The index (about 250 KB) loads on first use.
  let index = null;
  const loadIndex = async () => (index ||= await getJson(PUBLIC_BASE + "addresses.json", { streets: {} }));
  const input = $("#addr");
  input.addEventListener("focus", loadIndex, { once: true });
  input.addEventListener("input", async () => {
    const idx = await loadIndex();
    $("#addrList").innerHTML = suggest(idx, input.value).map((s) => `<option value="${esc(titleCase(s))}">`).join("");
  });
  $("#findForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const p = parseAddress(q);
    if (!p || p.number == null) { show(`<p>${esc(t("need_number"))}</p>`); return; }
    const hit = findAddress(await loadIndex(), q);
    if (!hit) { show(`<p>${esc(t("not_found"))}</p>`); return; }
    m.mark(hit.lat, hit.lng);
    show(answerHtml(regions, site, hit.lng, hit.lat, hit.exact ? "" : t("near_label", { label: titleCase(hit.label) })));
    answer.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  $("#locateBtn")?.addEventListener("click", () => {
    show(`<p class="muted">${esc(t("locating"))}</p>`);
    navigator.geolocation.getCurrentPosition(
      (pos) => { const { latitude: lat, longitude: lng } = pos.coords; m.mark(lat, lng); show(answerHtml(regions, site, lng, lat)); },
      () => show(`<p>${esc(t("locate_failed"))}</p>`),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

function hoodPage(slug, { regions, site, hoodRows, events, resources, osm, places }) {
  const app = $("#app");
  const f = regions.features.find((x) => x.properties.kind === "neighborhood" && x.properties.slug === slug);
  if (!f) {
    app.innerHTML = `<p><a href="${esc(pageHref())}">${esc(t("back"))}</a></p><section class="card"><p>${esc(t("hood_not_found"))}</p></section>`;
    return;
  }
  const p = f.properties;
  document.title = `${p.name} · ${t("org")}`;
  const row = hoodRows.find((r) => Number(r.map_id) === p.id) || {};
  const photo = safeUrl(row.photo);
  const meets = localized(row, "meets", lang).text || p.meets;
  const hoodEvents = events.filter((e) => e.neighborhood === slug || String(e.neighborhood) === String(p.id));
  const nearby = resources.filter((r) => r.category === "projects" && r.neighborhood === slug);
  const projects = nearby.length ? nearby : resources.filter((r) => r.category === "projects" && !r.neighborhood);
  const elections = resources.filter((r) => r.category === "elections");
  const report = resources.find((r) => r.category === "city" && /seeclickfix/.test(r.link || ""));

  app.innerHTML = `
    <p class="crumb"><a href="${esc(pageHref())}">${esc(t("back"))}</a></p>
    <section class="card hoodhead" style="--hood:${esc(p.color)}">
      <h1>${esc(p.name)}</h1>
      ${photo ? `<img class="photo" src="${esc(photo)}" alt="">` : ""}
      ${row.description_en || row.description_es || row.description ? `<p>${textOf(row, "description")}</p>` : ""}
      ${meets ? `<p><b>${esc(t("meets", { when: meets }))}</b></p>` : ""}
      <div class="actions">
        ${button(row.join_link, t("join"), "btn primary")}
        ${report ? button(report.link, t("report")) : ""}
        <button class="btn" id="printBtn" type="button">${esc(t("print"))}</button>
        <button class="btn" id="shareBtn" type="button">${esc(t("share"))}</button>
      </div>
      <p id="shareNote" class="muted small" hidden>${esc(t("copied"))}</p>
    </section>
    <section class="mapwrap">
      <div id="map" class="map small-map" role="region" aria-label="${esc(p.name)}"></div>
      <div class="chips" id="chips"></div>
    </section>
    ${section("events", t("hood_events"), eventList(hoodEvents))}
    ${section("projects", nearby.length ? t("projects_nearby") : t("projects_title"), projects.length ? linkList(projects, { englishOnly: true }) : "")}
    ${section("vote", t("vote_title"), elections.length ? `<p>${esc(t("vote_intro"))}</p>${linkList(elections)}` : "")}`;

  const m = createMap($("#map"), { regions, t, hrefFor: hoodHref, focus: slug });
  addLayers(m, osm, hoodEvents, places);
  $("#chips").innerHTML = layerChips(m, ["parks", "library", "events"]);
  wireChips($("#chips"), m);
  $("#printBtn").addEventListener("click", () => window.print());
  $("#shareBtn").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title: p.name, url }); return; }
      await navigator.clipboard.writeText(url);
      $("#shareNote").hidden = false;
    } catch { /* cancelled */ }
  });
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, x) => n + x.toLowerCase());
}

function chrome(site) {
  document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
  const other = lang === "es" ? "en" : "es";
  const q = new URLSearchParams(location.search);
  q.set("lang", other);
  const sw = $("#langSwitch");
  sw.href = `?${q}`;
  sw.textContent = t("lang_other");
  sw.lang = other;
  sw.addEventListener("click", () => rememberLang(other));
  $(".brand").href = pageHref();
  $("#foot").innerHTML = `
    <p class="tagline">${esc(t("tagline"))}</p>
    ${safeUrl(site.suggest_link) ? `<p><a href="${esc(site.suggest_link)}" target="_blank" rel="noopener">${esc(t("suggest"))}</a></p>` : ""}
    <p class="small muted">${esc(t("foot"))} ${esc(t("osm_credit"))} · <a href="organize/">${esc(t("organizers"))}</a></p>`;
}

async function boot() {
  const [regions, site, hoodRows, events, places, resources, osm] = await Promise.all([
    getJson(PUBLIC_BASE + "regions.geojson", null),
    getJson(CONTENT_BASE + "site.json", {}),
    getJson(CONTENT_BASE + "neighborhoods.json", []),
    getJson(CONTENT_BASE + "events.json", []),
    getJson(CONTENT_BASE + "places.json", []),
    getJson(CONTENT_BASE + "resources.json", []),
    getJson(PUBLIC_BASE + "osm.json", null),
  ]);
  chrome(site);
  if (!regions?.features) {
    $("#app").innerHTML = `<section class="card"><h1>${esc(t("find_title"))}</h1><p>${esc(t("map_updating"))}</p></section>`;
    return;
  }
  const data = {
    regions, site, osm,
    hoodRows: approved(hoodRows),
    events: upcoming(events, todayIso()),
    places: approved(places),
    resources: approved(resources, { optional: true }),
  };
  const slug = params.get("n");
  if (slug) hoodPage(slug, data); else homePage(data);
}

boot();
