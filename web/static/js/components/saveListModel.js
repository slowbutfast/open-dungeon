// Pure restore-window helpers (gravitational-node-map PATCH-04).
//
// DOM-free ESM: sort modes, prune selection and pagination are unit-tested
// under `node --test`. The API client owns rendering and persistence.

export const SAVE_SORT_MODES = ['recent', 'alpha', 'moves'];
export const SAVE_PAGE_SIZE = 50;

function titleOf(save) {
  return String(save?.title ?? '');
}

function idOf(save) {
  return String(save?.id ?? save?.adventure_id ?? '');
}

function compareTitles(a, b) {
  return titleOf(a).localeCompare(titleOf(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function tieBreak(a, b) {
  return compareTitles(a, b) || idOf(a).localeCompare(idOf(b));
}

/**
 * Sort saves by `recent` (updated_at desc, default), `alpha` (numeric-aware,
 * case-insensitive A–Z) or `moves` (desc). Missing `updated_at` / `moves` are
 * treated as 0. Ties fall back to title then id so ordering is deterministic.
 */
export function sortSaves(saves, mode = 'recent') {
  const list = Array.isArray(saves) ? saves.slice() : [];
  return list.sort((a, b) => {
    if (mode === 'alpha') {
      return tieBreak(a, b);
    }
    if (mode === 'moves') {
      const delta = (b?.moves ?? 0) - (a?.moves ?? 0);
      if (delta !== 0) return delta;
      return tieBreak(a, b);
    }
    const delta = (b?.updated_at ?? 0) - (a?.updated_at ?? 0);
    if (delta !== 0) return delta;
    return tieBreak(a, b);
  });
}

/** Saves strictly below the move threshold, excluding the active adventure. */
export function selectPrunable(saves, maxMoves, activeAdventureId = null) {
  const threshold = Number(maxMoves);
  if (!Number.isFinite(threshold)) return [];
  return (Array.isArray(saves) ? saves : []).filter(save => (
    idOf(save) !== String(activeAdventureId ?? '')
    && (save?.moves ?? 0) < threshold
  ));
}

/** First `shown` items (the "Show more" page window). */
export function pageSlice(items, shown, pageSize = SAVE_PAGE_SIZE) {
  const limit = Math.max(0, Number(shown) || 0);
  const size = Math.max(1, Number(pageSize) || SAVE_PAGE_SIZE);
  return (Array.isArray(items) ? items : []).slice(0, Math.min(limit, size === 0 ? 0 : limit));
}
