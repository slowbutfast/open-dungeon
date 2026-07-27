import { showScreen } from '../ui/screens.js';
import { showConfirm } from '../ui/toast.js';

export async function loadPresets() {
  const listContainer = document.getElementById("preset-list");
  listContainer.innerHTML = `
    <div class="loader-container" style="grid-column: 1 / -1;">
      <div class="retro-spinner"></div>
      <span class="loader-text">[RETRIEVING SIMULATION TEMPLATES...]</span>
    </div>
  `;
  try {
    const res = await fetch("/api/presets");
    window.presets = await res.json();
    listContainer.innerHTML = "";

    window.presets.forEach((preset, idx) => {
      const card = document.createElement("div");
      card.className = "preset-card";
      card.tabIndex = 0;
      card.innerHTML = `
        <h3>${preset.name}</h3>
        <p>${preset.summary.substring(0, 110)}...</p>
      `;
      card.addEventListener("click", () => {
        document.querySelectorAll(".preset-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        window.selectedPresetIdx = idx;

        document.getElementById("custom-title").value = preset.title;
        document.getElementById("custom-summary").value = preset.summary;
        document.getElementById("custom-system-prompt").value = preset.system_prompt;

        const btnCustomize = document.getElementById("btn-preset-customize");
        if (btnCustomize) btnCustomize.classList.remove("hidden");
        document.getElementById("btn-preset-next").classList.remove("hidden");
      });

      listContainer.appendChild(card);
    });
  } catch (err) {
    listContainer.innerHTML = `<p class="help-text" style="grid-column: 1 / -1; text-align: center; margin: 2rem 0; color: #ef4444;">Failed to load presets: ${err}</p>`;
  }
}

export function loadCharactersList(presetIdx) {
  const grid = document.getElementById("character-grid");
  grid.innerHTML = "";

  let chars = [];
  if (presetIdx !== null && window.presets && window.presets[presetIdx]) {
    chars = window.presets[presetIdx].characters;
  } else {
    chars = [
      {"name": "Valen", "type": "Warrior", "desc": "A strong fighter with a steel sword and shield.", "triggers": ["valen", "warrior"]},
      {"name": "Garrick", "type": "Mage", "desc": "A spellcaster wielding a wooden staff and fire spells.", "triggers": ["garrick", "mage"]},
      {"name": "Lyra", "type": "Rogue", "desc": "A stealthy thief wielding dual daggers.", "triggers": ["lyra", "rogue"]}
    ];
  }

  chars.forEach((char, idx) => {
    const card = document.createElement("div");
    card.className = "char-card" + (idx === 0 ? " active" : "");
    card.innerHTML = `
      <h4>${char.name}</h4>
      <div class="char-type">${char.type}</div>
      <p>${char.desc}</p>
    `;
    card.addEventListener("click", () => window.selectCharacterCard(idx));
    grid.appendChild(card);
  });

  window.selectedCharacterIdx = 0;
  window.currentLoadedCharacters = chars;

  document.getElementById("custom-character-form").classList.add("hidden");
  document.getElementById("preset-character-section").classList.remove("hidden");
  document.getElementById("btn-char-custom-toggle").innerText = "Customize Hero";
}

export function selectCharacterCard(idx) {
  document.querySelectorAll(".char-card").forEach((c, cIdx) => {
    c.classList.toggle("active", cIdx === idx);
  });
  window.selectedCharacterIdx = idx;
}

export function populateCustomCharFromSelected() {
  const chars = window.currentLoadedCharacters || [];
  const idx = window.selectedCharacterIdx || 0;
  const char = chars[idx];
  if (char) {
    document.getElementById("char-name").value = char.name || "";
    document.getElementById("char-role").value = char.type || "";
    document.getElementById("char-desc").value = char.desc || "";
    document.getElementById("char-triggers").value = Array.isArray(char.triggers) ? char.triggers.join(", ") : (char.triggers || "");
  }
}

export async function loadPresetsManager() {
  const listContainer = document.getElementById("preset-manager-list");
  listContainer.innerHTML = `
    <div class="loader-container" style="grid-column: 1 / -1;">
      <div class="retro-spinner"></div>
      <span class="loader-text">[LOADING PRESETS...]</span>
    </div>
  `;
  try {
    const res = await fetch("/api/presets");
    const presets = await res.json();
    window.presets = presets;
    listContainer.innerHTML = "";

    presets.forEach((preset, idx) => {
      const card = document.createElement("div");
      card.className = "preset-card";
      card.tabIndex = 0;
      card.innerHTML = `
        <h3>${preset.name}</h3>
        <p>${(preset.summary || "").substring(0, 110)}...</p>
        <div class="preset-card-actions">
          <button class="btn-edit-preset btn-icon-action" data-index="${idx}" type="button" title="Edit Preset">✏ Edit</button>
          <button class="btn-delete-preset btn-icon-action btn-icon-delete" data-index="${idx}" type="button" title="Delete Preset">✕ Delete</button>
        </div>
      `;
      card.querySelector(".btn-edit-preset").addEventListener("click", (e) => {
        e.stopPropagation();
        openPresetEditor(idx);
      });
      card.querySelector(".btn-delete-preset").addEventListener("click", (e) => {
        e.stopPropagation();
        deletePresetByIdx(idx);
      });
      listContainer.appendChild(card);
    });
  } catch (err) {
    listContainer.innerHTML = `<p class="help-text" style="grid-column: 1 / -1; text-align: center; margin: 2rem 0; color: #ef4444;">Failed to load presets: ${err}</p>`;
  }
}

export function openPresetEditor(idx) {
  window._editingPresetIdx = idx;
  const presets = window.presets || [];
  const isNew = idx === undefined || idx === null || idx < 0 || idx >= presets.length;
  const preset = isNew ? null : presets[idx];

  const titleEl = document.getElementById("editor-title");
  titleEl.innerText = isNew ? "[CREATE NEW PRESET]" : "[EDIT PRESET]";

  document.getElementById("editor-preset-name").value = preset ? preset.name : "";
  document.getElementById("editor-preset-title").value = preset ? preset.title : "";
  document.getElementById("editor-preset-summary").value = preset ? preset.summary : "";
  document.getElementById("editor-preset-system-prompt").value = preset ? preset.system_prompt : "";

  // Render character sub-forms
  renderEditorCharacters(preset ? preset.characters : []);

  showScreen("preset-editor-screen");
}

function renderEditorCharacters(characters) {
  const container = document.getElementById("editor-characters-list");
  container.innerHTML = "";
  (characters || []).forEach((char, idx) => {
    const form = document.createElement("div");
    form.className = "editor-character-form";
    form.innerHTML = `
      <div class="char-form-header">
        <h5>Character ${idx + 1}</h5>
        <button class="btn-remove-character" data-index="${idx}" type="button">Remove</button>
      </div>
      <div class="char-form-row">
        <div class="form-group">
          <label>Name</label>
          <input type="text" class="editor-char-name" value="${escapeHtml(char.name || "")}">
        </div>
        <div class="form-group">
          <label>Type / Class</label>
          <input type="text" class="editor-char-type" value="${escapeHtml(char.type || "")}">
        </div>
      </div>
      <div class="char-form-row">
        <div class="form-group">
          <label>Description</label>
          <textarea class="editor-char-desc" rows="2">${escapeHtml(char.desc || "")}</textarea>
        </div>
      </div>
      <div class="char-form-row">
        <div class="form-group">
          <label>Trigger Words (comma separated)</label>
          <input type="text" class="editor-char-triggers" value="${Array.isArray(char.triggers) ? char.triggers.join(", ") : (char.triggers || "")}">
        </div>
      </div>
    `;
    form.querySelector(".btn-remove-character").addEventListener("click", () => {
      form.remove();
    });
    container.appendChild(form);
  });
}

function collectEditorCharacters() {
  const forms = document.querySelectorAll("#editor-characters-list .editor-character-form");
  const characters = [];
  forms.forEach(form => {
    const name = form.querySelector(".editor-char-name").value.trim();
    if (!name) return;
    const triggerStr = form.querySelector(".editor-char-triggers").value;
    characters.push({
      name: name,
      type: form.querySelector(".editor-char-type").value.trim(),
      desc: form.querySelector(".editor-char-desc").value.trim(),
      triggers: triggerStr.split(",").map(t => t.trim()).filter(Boolean)
    });
  });
  return characters;
}

export async function saveEditorPreset() {
  const name = document.getElementById("editor-preset-name").value.trim();
  if (!name) {
    alert("Preset name is required.");
    return;
  }
  const preset = {
    name: name,
    title: document.getElementById("editor-preset-title").value.trim(),
    summary: document.getElementById("editor-preset-summary").value.trim(),
    system_prompt: document.getElementById("editor-preset-system-prompt").value,
    characters: collectEditorCharacters()
  };

  const idx = window._editingPresetIdx;
  const isNew = idx === undefined || idx === null || idx < 0 || idx >= (window.presets || []).length;

  try {
    if (isNew) {
      await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset)
      });
    } else {
      await fetch(`/api/presets/${idx}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset)
      });
    }
    window._editingPresetIdx = null;
    await loadPresetsManager();
    showScreen("preset-manager-screen");
  } catch (err) {
    alert("Failed to save preset: " + err);
  }
}

export async function deletePresetByIdx(idx) {
  const presets = window.presets || [];
  const preset = presets[idx];
  if (!preset) return;

  const confirmed = await showConfirm(`Delete preset "${preset.name}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await fetch(`/api/presets/${idx}`, { method: "DELETE" });
    window.presets.splice(idx, 1);
    // Refresh both the manager list and the preset list
    await loadPresetsManager();
    await loadPresets();
  } catch (err) {
    alert("Failed to delete preset: " + err);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function launchSimulation() {
  const submitBtn = document.getElementById("btn-submit-character");
  const backBtn = document.getElementById("btn-char-back");
  const toggleBtn = document.getElementById("btn-char-custom-toggle");

  submitBtn.innerText = "CONNECTING NEURAL LINK...";
  submitBtn.disabled = true;
  backBtn.disabled = true;
  toggleBtn.disabled = true;

  try {
    const payload = {
      preset_idx: window.selectedPresetIdx,
      character: {}
    };

    if (window.selectedPresetIdx === null || window.storyCustomized) {
      payload.title = document.getElementById("custom-title").value.trim();
      payload.summary = document.getElementById("custom-summary").value;
      payload.system_prompt = document.getElementById("custom-system-prompt").value;
    }

    const customCharForm = document.getElementById("custom-character-form");
    const isCustomHero = !customCharForm.classList.contains("hidden");

    if (isCustomHero) {
      payload.character = {
        name: document.getElementById("char-name").value,
        type: document.getElementById("char-role").value,
        desc: document.getElementById("char-desc").value,
        triggers: document.getElementById("char-triggers").value
      };
    } else {
      let chars = [];
      if (window.selectedPresetIdx !== null && window.presets[window.selectedPresetIdx]) {
        chars = window.presets[window.selectedPresetIdx].characters;
      } else {
        chars = [
          {"name": "Valen", "type": "Warrior", "desc": "A strong fighter with a steel sword and shield.", "triggers": ["valen", "warrior"]},
          {"name": "Garrick", "type": "Mage", "desc": "A spellcaster wielding a wooden staff and fire spells.", "triggers": ["garrick", "mage"]},
          {"name": "Lyra", "type": "Rogue", "desc": "A stealthy thief wielding dual daggers.", "triggers": ["lyra", "rogue"]}
        ];
      }
      const selectedChar = chars[window.selectedCharacterIdx];
      payload.character = {
        name: selectedChar.name,
        type: selectedChar.type,
        desc: selectedChar.desc,
        triggers: selectedChar.triggers
      };
    }

    const res = await fetch("/api/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.status === "success") {
      await window.syncState();
      showScreen("gameplay-screen");
    } else {
      alert("Simulation failed to initialize: " + data.message);
    }
  } catch (err) {
    alert("Simulation failed to initialize: " + err);
  } finally {
    submitBtn.innerText = "Launch Simulation";
    submitBtn.disabled = false;
    backBtn.disabled = false;
    toggleBtn.disabled = false;
  }
}