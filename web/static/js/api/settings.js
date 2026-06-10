import { showToast } from '../ui/toast.js';
import { closeModal } from '../ui/screens.js';

export async function pingLlm() {
  const pill = document.getElementById("llm-status-pill");
  if (!pill) return;
  try {
    const res = await fetch("/api/ping");
    const data = await res.json();
    pill.className = "llm-pill llm-pill-" + data.status;

    const select = document.getElementById("model-selection-select");
    if (select && data.models) {
      const currentVal = select.value;
      select.innerHTML = "";
      data.models.forEach(model => {
        const opt = document.createElement("option");
        opt.value = model;
        opt.innerText = model;
        select.appendChild(opt);
      });
      if (window.currentGameState && window.currentGameState.model) {
        select.value = window.currentGameState.model;
      } else if (currentVal && data.models.includes(currentVal)) {
        select.value = currentVal;
      } else if (data.model) {
        select.value = data.model;
      }
    }

    if (data.status === "online") {
      const shortModel = data.model.length > 22
        ? data.model.substring(0, 22) + "…"
        : data.model;
      const shortEmbedding = data.embedding_model && data.embedding_model.length > 22
        ? data.embedding_model.substring(0, 22) + "…"
        : data.embedding_model || "n/a";
      pill.innerHTML = `&#9679; ONLINE — ${data.host}:${data.port} — LLM: ${shortModel} | EMBED: ${shortEmbedding}`;
    } else if (data.status === "mock") {
      const llmModel = data.model || "mock-llm";
      const embedModel = data.embedding_model || "mock-embedding-model";
      pill.innerHTML = `&#9679; MOCK MODE — ${data.host}:${data.port} — LLM: ${llmModel} | EMBED: ${embedModel}`;
    } else {
      pill.innerHTML = `&#9673; OFFLINE — ${data.host}:${data.port}`;
    }
  } catch {
    pill.className = "llm-pill llm-pill-offline";
    pill.innerHTML = "&#9673; OFFLINE";
  }
}

export async function saveSystemPrompt() {
  const newPrompt = document.getElementById("system-prompt-editor").value;
  const btn = document.getElementById("btn-save-system-prompt");
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = "[APPLYING RULES...]";
  try {
    const res = await fetch("/api/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_prompt: newPrompt })
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("Dungeon Master prompt updated");
      await window.syncState();
      closeModal("modal-system-prompt");
    } else {
      showToast("Update failed: " + data.message, true);
    }
  } catch (err) {
    showToast("Update failed: " + err, true);
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

export async function saveSummaryMemory() {
  const newSummary = document.getElementById("summary-editor").value;
  const saveBtn = document.getElementById("btn-save-summary");
  saveBtn.disabled = true;
  saveBtn.innerText = "Saving...";
  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: newSummary })
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("✓ Memory state saved");
      await window.syncState();
    } else {
      showToast("Save failed: " + data.message, true);
    }
  } catch (err) {
    showToast("Save failed: " + err, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerText = "Save Memory State";
  }
}