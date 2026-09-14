// Per-domain client for the spatial room graph (spatial-map-visualization-pathfinding, 6.1).
// Mirrors api/barter.js: one async function per endpoint, throwing on non-OK
// so callers can fall back to an empty state instead of rendering garbage.

export async function fetchMap() {
  const res = await fetch('/api/map');
  if (!res.ok) throw new Error('Failed to fetch map');
  const data = await res.json();
  // Normalise the shape so the panel can always read `rooms`/`edges`/`regions`
  // even if a surface ever returns a partial payload.
  return {
    rooms: Array.isArray(data.rooms) ? data.rooms : [],
    edges: Array.isArray(data.edges) ? data.edges : [],
    regions: Array.isArray(data.regions) ? data.regions : [],
    current_room_id: data.current_room_id ?? null
  };
}
