import { showToast, showConfirm } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/screens.js';
import { scrollToBottom } from '../utils.js';

export async function toggleLoreCard(idx) {
  const res = await fetch("/api/lore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "toggle", index: idx })
  });
  const data = await res.json();
  if (data.status === "success") {
    window.renderLoreCards(data.cards);
  }
}

export async function deleteLoreCard(idx) {
  const confirmed = await showConfirm("Wipe this lore card from active simulation memory?");
  if (confirmed) {
    const res = await fetch("/api/lore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", index: idx })
    });
    const data = await res.json();
    if (data.status === "success") {
      window.renderLoreCards(data.cards);
    }
  }
}

export function editLoreCard(idx) {
  if (!window.currentGameState || !window.currentGameState.cards[idx]) return;

  const card = window.currentGameState.cards[idx];
  document.getElementById("lore-modal-title").innerText = "[EDIT LORE BOOK CARD]";
  document.getElementById("lore-card-index").value = idx;
  document.getElementById("lore-name").value = card.name;
  document.getElementById("lore-type").value = card.type || "character";
  document.getElementById("lore-desc").value = card.description || "";
  const triggers = card.triggers || card.trigger_words || [];
  document.getElementById("lore-triggers").value = triggers.join(", ");

  openModal("modal-lore-card");
}

export async function saveLoreCard() {
  const indexVal = document.getElementById("lore-card-index").value;
  const action = indexVal === "" ? "add" : "update";
  const index = indexVal === "" ? null : parseInt(indexVal);

  const payload = {
    action: action,
    index: index,
    card: {
      name: document.getElementById("lore-name").value,
      type: document.getElementById("lore-type").value,
      description: document.getElementById("lore-desc").value,
      triggers: document.getElementById("lore-triggers").value
    }
  };

  const res = await fetch("/api/lore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.status === "success") {
    closeModal("modal-lore-card");
    await window.syncState();
  } else {
    alert("Save failed: " + data.message);
  }
}

export async function triggerLoreScan() {
  const scanBtn = document.getElementById("btn-scan");
  const originalText = scanBtn.innerText;
  window.setConsoleDisabled(true);
  scanBtn.innerText = "/scan (scanning...)";

  const log = document.getElementById("console-log");
  const sysDiv = document.createElement("div");
  sysDiv.className = "log-turn log-turn-system";
  sysDiv.innerText = "[SYSTEM: Scanning context to extract lorebook entities...]";
  log.appendChild(sysDiv);
  scrollToBottom();

  try {
    const res = await fetch("/api/scan", { method: "POST" });
    const data = await res.json();

    if (data.status === "success") {
      await window.syncState();
      const feedbackDiv = document.createElement("div");
      feedbackDiv.className = "log-turn log-turn-system";
      feedbackDiv.innerText = `[SYSTEM: ${data.message}]`;
      document.getElementById("console-log").appendChild(feedbackDiv);
      scrollToBottom();
    } else {
      showToast("Scan failed: " + data.message, true);
    }
  } catch (err) {
    showToast("Scan failed: " + err, true);
  } finally {
    window.setConsoleDisabled(false);
    scanBtn.innerText = originalText;
  }
}