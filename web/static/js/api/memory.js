import { renderLoreCards, renderInventory, renderEventsLog, renderMemoryStats, renderState } from '../ui/renderers.js';

export async function syncState() {
  try {
    const res = await fetch("/api/state");
    const state = await res.json();
    window.currentGameState = state;
    renderState(state);
    await syncMemoryDetails();
  } catch (e) {
    // quiet fail
  }
}

export async function syncMemoryAndLore() {
  try {
    const res = await fetch("/api/state");
    const state = await res.json();
    window.currentGameState = state;

    const locationEl = document.getElementById("val-location");
    const scoreEl = document.getElementById("val-score");
    const movesEl = document.getElementById("val-moves");
    const summaryEl = document.getElementById("summary-editor");

    if (locationEl) locationEl.innerText = state.location;
    if (scoreEl) scoreEl.innerText = state.score;
    if (movesEl) movesEl.innerText = state.moves;
    if (summaryEl) summaryEl.value = state.summary;

    renderLoreCards(state.cards);
    await syncMemoryDetails();
  } catch (e) {
    // quiet fail
  }
}

export async function syncMemoryDetails() {
  try {
    const [resInv, resEvt, resStats] = await Promise.all([
      fetch("/api/memory/inventory"),
      fetch("/api/memory/events"),
      fetch("/api/memory/stats")
    ]);
    if (resInv.ok) {
      const items = await resInv.json();
      renderInventory(items);
    }
    if (resEvt.ok) {
      const events = await resEvt.json();
      renderEventsLog(events);
    }
    if (resStats.ok) {
      const stats = await resStats.json();
      renderMemoryStats(stats);
    }
  } catch (e) {
    // quiet fail
  }
}