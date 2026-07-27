import { showToast } from '../ui/toast.js';
import { closeModal } from '../ui/screens.js';
import { renderCostSummary } from '../ui/renderers.js';

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
      data.models.forEach((model, idx) => {
        const opt = document.createElement("option");
        opt.value = model;
        const caption = data.modelCaptions && data.modelCaptions[idx] ? data.modelCaptions[idx] : null;
        opt.innerText = caption ? `${model} — ${caption}` : model;
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

    // Apply dynamic token range if provided by backend
    if (data.max_tokens_range) {
      const [min, max] = data.max_tokens_range;
      const slider = document.getElementById("token-limit-slider");
      const rangeLabel = document.getElementById("token-range-label");
      if (slider) {
        slider.min = min;
        slider.max = max;
        if (parseInt(slider.value) > max) {
          slider.value = max;
          document.getElementById("token-limit-val").innerText = max;
        }
      }
      if (rangeLabel) {
        rangeLabel.innerText = `Range: ${min} - ${max}`;
      }
    }

    // Render cost if provided
    if (data.cost) {
      renderCostSummary(data.cost);
    }

    if (data.status === "online") {
      const backendLabel = data.backend === "openrouter" ? "OPENROUTER" : "LM STUDIO";
      const shortModel = data.model && data.model.length > 22
        ? data.model.substring(0, 22) + "…"
        : data.model || "?";
      const shortEmbed = data.embedding_model && data.embedding_model.length > 22
        ? data.embedding_model.substring(0, 22) + "…"
        : data.embedding_model || "";
      const embedStr = shortEmbed ? ` | EMBED: ${shortEmbed}` : "";
      pill.innerHTML = `&#9679; ${backendLabel} — ${shortModel}${embedStr}`;
    } else if (data.status === "mock") {
      const llmModel = data.model || "mock-llm";
      pill.innerHTML = `&#9679; MOCK MODE — ${llmModel}`;
    } else {
      const hostInfo = data.host ? `${data.host}:${data.port}` : "?";
      pill.innerHTML = `&#9673; OFFLINE — ${hostInfo}`;
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