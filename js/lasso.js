// Polygon selection: click to add corners, double-click (or click the first corner) to finish, Esc to
// cancel. Resolves with the lots whose center falls inside, or null when cancelled.
import { map, lotCenter, lotLayers } from "./render.js";
import { insidePolygon } from "./geo.js";

export { insidePolygon };

let active = null;

export function isSelecting() { return Boolean(active); }
export function cancelSelection() { active?.finish(null); }

export function selectArea() {
  cancelSelection();
  return new Promise((resolve) => {
    const pts = [];
    const line = L.polyline([], { color: "#1a202c", weight: 2, dashArray: "5 5", interactive: false }).addTo(map);
    const guide = L.polyline([], { color: "#1a202c", weight: 1, opacity: 0.6, interactive: false }).addTo(map);
    const corners = L.layerGroup().addTo(map);
    const container = map.getContainer();
    container.classList.add("selecting");
    map.doubleClickZoom.disable();

    const onClick = (e) => {
      if (pts.length >= 3 && map.latLngToContainerPoint(pts[0]).distanceTo(e.containerPoint) < 12) { done(); return; }
      pts.push(e.latlng);
      line.setLatLngs(pts);
      L.circleMarker(e.latlng, { radius: pts.length === 1 ? 6 : 4, color: "#1a202c", weight: 2, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(corners);
    };
    const onMove = (e) => { if (pts.length) guide.setLatLngs([pts[pts.length - 1], e.latlng, pts[0]]); };
    const onDbl = (e) => { L.DomEvent.stop(e); done(); };
    const onKey = (e) => { if (e.key === "Escape") finish(null); if (e.key === "Enter") done(); };

    function done() {
      if (pts.length < 3) { finish(null); return; }
      const ring = pts.map((p) => [p.lat, p.lng]);
      const bounds = L.latLngBounds(pts);
      const hits = [];
      for (const apn of Object.keys(lotLayers)) {
        const c = lotCenter(apn);
        if (c && bounds.contains(c) && insidePolygon(c, ring)) hits.push(apn);
      }
      finish(hits);
    }
    function finish(result) {
      map.off("click", onClick); map.off("mousemove", onMove); map.off("dblclick", onDbl);
      document.removeEventListener("keydown", onKey);
      for (const l of [line, guide, corners]) map.removeLayer(l);
      container.classList.remove("selecting");
      setTimeout(() => map.doubleClickZoom.enable(), 0);
      active = null;
      resolve(result);
    }
    map.on("click", onClick); map.on("mousemove", onMove); map.on("dblclick", onDbl);
    document.addEventListener("keydown", onKey);
    active = { finish };
  });
}
