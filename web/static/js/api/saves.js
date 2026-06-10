import { showScreen } from '../ui/screens.js';
import { showToast, showConfirm } from '../ui/toast.js';

export async function loadSavesList() {
  const list = document.getElementById("save-list");
  list.innerHTML = `
    <div class="loader-container">
      <div class="retro-spinner"></div>
      <span class="loader-text">[SCANNING NEURAL CHANNELS FOR SECURED CONNECTIONS...]</span>
    </div>
  `;
  try {
    const res = await fetch("/api/saves");
    const saves = await res.json();
    list.innerHTML = "";

    if (saves.length === 0) {
      list.innerHTML = `<p class="help-text" style="text-align: center; margin: 2rem 0;">No active saved connections found.</p>`;
      return;
    }

    saves.forEach(save => {
      const item = document.createElement("div");
      item.className = "save-item";
      item.innerHTML = `
        <div class="save-details">
          <h4>${save.title}</h4>
          <p>Location: ${save.location} | Summary: ${save.summary.substring(0, 65)}...</p>
          <div class="save-meta">Slot ID: ${save.id} // connection turns: ${save.turns}</div>
        </div>
        <div class="save-actions">
          <button class="btn btn-primary btn-sm btn-restore">Restore</button>
          <button class="btn btn-secondary btn-sm btn-delete" style="color:#ef4444;">Delete</button>
        </div>
      `;

      item.querySelector(".btn-restore").addEventListener("click", (e) => loadSaveGame(save.id, e.target));
      item.querySelector(".btn-delete").addEventListener("click", (e) => deleteSaveGame(save.id, e.target));

      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p class="help-text" style="text-align: center; margin: 2rem 0; color: #ef4444;">Failed to load saved games: ${err}</p>`;
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