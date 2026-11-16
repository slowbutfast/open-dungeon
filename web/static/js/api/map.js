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

// Deterministic walk route behind the map inspector's ROUTE HERE action.
// `fromRoomId` defaults to the server's current room. The AbortSignal lets the
// panel cancel a stale request when a new route is requested or the inspector
// closes. A 404 carries `error.status = 404` so the caller can distinguish an
// unknown room from an unreachable one.
export async function fetchPath(toRoomId, fromRoomId, signal) {
  const params = new URLSearchParams();
  if (toRoomId) params.set('to', toRoomId);
  if (fromRoomId) params.set('from', fromRoomId);

  const res = await fetch(`/api/path?${params.toString()}`, { signal });
  if (!res.ok) {
    const error = new Error(
      res.status === 404 ? 'Route unavailable (404)' : `Failed to fetch path (${res.status})`
    );
    error.status = res.status;
    try {
      error.payload = await res.json();
    } catch {
      error.payload = null;
    }
    throw error;
  }

  const data = await res.json();
  return {
    ...data,
    found: Boolean(data.found),
    steps: Array.isArray(data.steps) ? data.steps : [],
    reason: data.reason ?? null
  };
}
