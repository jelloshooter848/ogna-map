// The public map: Oldtown, its neighborhoods, the part with no group yet, and optional place layers.
import { TILE_URL, TILE_ATTRIBUTION, DEFAULT_VIEW } from "../js/config.js";

const ICONS = { park: "🌳", school: "🏫", library: "📚", community: "🏠", transit: "🚌", event: "📅", place: "📍" };
const LAYER_OF = { park: "parks", school: "schools", community: "parks", library: "library", transit: "transit" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pin = (emoji, cls = "") => L.divIcon({ className: `pin ${cls}`, html: `<span>${emoji}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });

/**
 * Draws the map into `el`. `regions` is data/public/regions.geojson. `hrefFor(feature)` gives a neighborhood's
 * page link. Returns helpers for the page.
 */
export function createMap(el, { regions, t, hrefFor, focus = null, onPick = null }) {
  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, tap: true }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);

  const feats = regions?.features || [];
  const district = feats.find((f) => f.properties.kind === "district");
  const open = feats.find((f) => f.properties.kind === "unorganized");
  const hoods = feats.filter((f) => f.properties.kind === "neighborhood");

  if (open) {
    L.geoJSON(open, { style: { color: "#b7791f", weight: 0, fillColor: "#f6e05e", fillOpacity: focus ? 0.12 : 0.28 }, interactive: !onPick })
      .bindPopup(`<b>${esc(t("in_oldtown_popup"))}</b><br>${esc(t("no_group_cta"))}`).addTo(map);
  }
  const hoodLayer = L.geoJSON({ type: "FeatureCollection", features: hoods }, {
    style: (f) => ({ color: f.properties.color, weight: focus && f.properties.slug !== focus ? 1 : 3,
      fillColor: f.properties.color, fillOpacity: focus && f.properties.slug !== focus ? 0.06 : 0.22 }),
    onEachFeature: (f, layer) => {
      const meets = f.properties.meets ? `<br>${esc(t("meets", { when: f.properties.meets }))}` : "";
      // On the search page a tap looks the point up instead (the answer card links to the page).
      if (!onPick) layer.bindPopup(`<b>${esc(f.properties.name)}</b>${meets}<br><a href="${esc(hrefFor(f))}">${esc(t("view"))} →</a>`);
      layer.bindTooltip(f.properties.name, { sticky: true, direction: "top" });
    },
  }).addTo(map);
  if (district) L.geoJSON(district, { style: { color: "#1a202c", weight: 2.5, dashArray: "6 5", fill: false }, interactive: false }).addTo(map);

  // Fit: the focused neighborhood, else the district.
  const target = (focus && hoods.find((f) => f.properties.slug === focus)) || district;
  if (target) map.fitBounds(L.geoJSON(target).getBounds(), { padding: [12, 12] });

  // Optional layers, toggled by the chips under the map.
  const groups = {};
  const group = (k) => (groups[k] ||= L.layerGroup());
  function addPlace(cat, lat, lng, html) {
    const k = LAYER_OF[cat] || (cat === "event" ? "events" : "places");
    L.marker([lat, lng], { icon: pin(ICONS[cat] || ICONS.place, cat), title: "" }).bindPopup(html).addTo(group(k));
  }
  function show(key, on) { const g = group(key); on ? g.addTo(map) : g.remove(); }

  let marker = null;
  function mark(lat, lng) {
    marker?.remove();
    marker = L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#c53030", fillOpacity: 1 }).addTo(map);
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }
  if (onPick) map.on("click", (e) => onPick(e.latlng.lat, e.latlng.lng));

  return { map, addPlace, show, mark, groups, hoodLayer };
}

export { ICONS, LAYER_OF };
