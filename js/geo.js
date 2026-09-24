// Point-in-polygon helpers shared by the organizer map, the public site and the build scripts. No DOM.

/** Ray-casting point-in-polygon on [lat, lng] pairs. */
export function insidePolygon([y, x], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when [lng, lat] falls inside a GeoJSON Polygon or MultiPolygon (holes respected). */
export function inGeometry([lng, lat], geom) {
  if (!geom) return false;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  const flip = (ring) => ring.map(([x, y]) => [y, x]);
  return polys.some(([outer, ...holes]) =>
    insidePolygon([lat, lng], flip(outer)) && !holes.some((h) => insidePolygon([lat, lng], flip(h))));
}
