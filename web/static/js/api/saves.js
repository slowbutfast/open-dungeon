import { showScreen } from '../ui/screens.js';
import { showToast, showConfirm } from '../ui/toast.js';
import {
  SAVE_PAGE_SIZE,
  SAVE_SORT_MODES,
  pageSlice,
  sortSaves,
} from '../components/saveListModel.js';

const SORT_STORAGE_KEY = 'od.saveSortMode';

let allSaves = [];
let sortMode = readSortMode();
let shown = SAVE_PAGE_SIZE;
let toolbarWired = false;
let previewTimer = null;

function readSortMode() {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    if (SAVE_SORT_MODES.includes(stored)) return stored;
  } catch {
    // localStorage can be blocked; fall back to Recent.
  }
  return 'recent';
}

function persistSortMode(mode) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch {
    // Non-fatal.
  }
}

function ensureToolbar() {
  const sortSelect = document.getElementById('save-sort');
  if (sortSelect) sortSelect.value = sortMode;

  if (toolbarWired) return;
  toolbarWired = true;

  sortSelect?.addEventListener('change', () => {
    const next = sortSelect.value;
    if (!SAVE_SORT_MODES.includes(next)) return;
    sortMode = next;
    persistSortMode(next);
    shown = SAVE_PAGE_SIZE;
    renderSaves();
  });

  const thresholdInput = document.getElementById('save-prune-moves');
  thresholdInput?.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => updatePrunePreview(), 250);
  });

  document.getElementById('btn-prune-saves')?.addEventListener('click', pruneSaves);

  document.getElementById('btn-saves-more')?.addEventListener('click', () => {
    shown += SAVE_PAGE_SIZE;
    renderSaves();
  });
}

export async function loadSavesList() {
  const list = document.getElementById('save-list');
  if (!list) return;
  list.innerHTML = `
    <div class="loader-container">
      <div class="retro-spinner"></div>
      <span class="loader-text">[SCANNING NEURAL CHANNELS FOR SECURED CONNECTIONS...]</span>
    </div>
  `;

  try {
    const res = await fetch('/api/saves');
    const saves = await res.json();
    allSaves = Array.isArray(saves) ? saves : [];
    shown = SAVE_PAGE_SIZE;
    ensureToolbar();
    renderSaves();
    updatePrunePreview();
  } catch (err) {
    list.innerHTML = `<p class="help-text" style="text-align: center; margin: 2rem 0; color: #ef4444;">Failed to load saved games: ${err}</p>`;
  }
}

function renderSaves() {
  const list = document.getElementById('save-list');
  if (!list) return;
  list.innerHTML = '';

  if (allSaves.length === 0) {
    list.innerHTML = '<p class="help-text" style="text-align: center; margin: 2rem 0;">No active saved connections found.</p>';
    document.getElementById('btn-saves-more')?.classList.add('hidden');
    return;
  }

  const sorted = sortSaves(allSaves, sortMode);
  const visible = pageSlice(sorted, shown, SAVE_PAGE_SIZE);
  for (const save of visible) {
    list.appendChild(buildSaveItem(save));
  }

  const more = document.getElementById('btn-saves-more');
  if (more) {
    const remaining = sorted.length - visible.length;
    more.classList.toggle('hidden', remaining <= 0);
    more.textContent = remaining > 0
      ? `SHOW MORE (${remaining} remaining)`
      : 'SHOW MORE';
  }
}

function buildSaveItem(save) {
  const item = document.createElement('div');
  item.className = 'save-item';

  const details = document.createElement('div');
  details.className = 'save-details';

  const title = document.createElement('h4');
  title.textContent = save.title || 'Untitled Adventure';
  details.appendChild(title);

  const summary = document.createElement('p');
  const fullSummary = String(save.summary || '');
  const shortSummary = fullSummary.length > 65
    ? `${fullSummary.slice(0, 65)}...`
    : fullSummary;
  summary.textContent = `Location: ${save.location || 'Unknown'} | Summary: ${shortSummary}`;
  details.appendChild(summary);

  const meta = document.createElement('div');
  meta.className = 'save-meta';
  meta.textContent = `Slot ID: ${save.id} // Moves: ${save.moves ?? 0}`;
  details.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'save-actions';
  const restore = document.createElement('button');
  restore.className = 'btn btn-primary btn-sm btn-restore';
  restore.textContent = 'Restore';
  restore.addEventListener('click', (event) => loadSaveGame(save.id, event.target));
  const remove = document.createElement('button');
  remove.className = 'btn btn-secondary btn-sm btn-delete';
  remove.style.color = '#ef4444';
  remove.textContent = 'Delete';
  remove.addEventListener('click', (event) => deleteSaveGame(save.id, event.target));
  actions.appendChild(restore);
  actions.appendChild(remove);

  item.appendChild(details);
  item.appendChild(actions);
  return item;
}

function pruneThreshold() {
  const input = document.getElementById('save-prune-moves');
  const value = Number(input?.value);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

async function requestPrune(maxMoves, dryRun) {
  const res = await fetch('/api/saves/prune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_moves: maxMoves, dry_run: dryRun }),
  });
  const data = await res.json();
  if (!res.ok || data.status === 'error') {
    throw new Error(data.message || `Prune failed (${res.status})`);
  }
  return data;
}

async function updatePrunePreview() {
  const preview = document.getElementById('save-prune-preview');
  if (!preview) return;
  const threshold = pruneThreshold();
  if (threshold === null) {
    preview.textContent = 'Enter a move threshold ≥ 1.';
    return;
  }
  preview.textContent = 'Scanning…';
  try {
    const data = await requestPrune(threshold, true);
    preview.textContent = `${allSaves.length} saves · ${data.count} with < ${threshold} moves`;
  } catch (err) {
    preview.textContent = err.message;
  }
}

async function pruneSaves() {
  const threshold = pruneThreshold();
  if (threshold === null) {
    showToast('Prune threshold must be an integer ≥ 1.', true);
    return;
  }

  try {
    const preview = await requestPrune(threshold, true);
    if (!preview.count) {
      showToast('No saved games match that threshold.', false);
      return;
    }
    const confirmed = await showConfirm(
      `Delete ${preview.count} save(s) with fewer than ${threshold} moves? `
      + 'The active save is excluded. This cannot be undone.'
    );
    if (!confirmed) return;

    const result = await requestPrune(threshold, false);
    const deleted = result.deletedIds?.length ?? 0;
    const failed = result.failedIds?.length ?? 0;
    showToast(`Deleted ${deleted}, kept ${result.keptCount ?? 0}`
      + (failed ? ` (${failed} failed)` : ''), false);
    await loadSavesList();
  } catch (err) {
    showToast(`Prune failed: ${err.message}`, true);
  }
}

export async function loadSaveGame(saveId, btn) {
  const allButtons = document.querySelectorAll("#save-list button");
  allButtons.forEach(b => b.disabled = true);
  const originalText = btn.innerText;
  btn.innerText = "[STABILIZING LINK...]";
  try {
    const res = await fetch(`/api/saves/${saveId}`, { method: "POST" });
    const data = await res.json();
    if (data.status === "success") {
      await window.syncState();
      showScreen("gameplay-screen");
    } else {
      showToast("Restore failed: " + data.message, true);
    }
  } catch (err) {
    showToast("Restore failed: " + err, true);
  } finally {
    allButtons.forEach(b => b.disabled = false);
    btn.innerText = originalText;
  }
}

export async function deleteSaveGame(saveId, btn) {
  const confirmed = await showConfirm("Permanently wipe this save simulation Connection?");
  if (confirmed) {
    const allButtons = document.querySelectorAll("#save-list button");
    allButtons.forEach(b => b.disabled = true);
    const originalText = btn.innerText;
    btn.innerText = "[WIPING...]";
    try {
      const res = await fetch(`/api/saves/${saveId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.status === "success") {
        loadSavesList();
      } else {
        showToast("Failed to delete save slot: " + data.message, true);
      }
    } catch (err) {
      showToast("Failed to delete save slot: " + err, true);
    } finally {
      if (document.body.contains(btn)) {
        allButtons.forEach(b => b.disabled = false);
        btn.innerText = originalText;
      }
    }
  }
}
