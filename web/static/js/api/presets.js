import { showScreen } from '../ui/screens.js';

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

        document.getElementById("btn-preset-customize").classList.remove("hidden");
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
  if (presetIdx !== null && window.presets[presetIdx]) {
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

  document.getElementById("custom-character-form").classList.add("hidden");
  document.getElementById("preset-character-section").classList.remove("hidden");
  document.getElementById("btn-char-custom-toggle").innerText = "Create Custom Hero";
}

export function selectCharacterCard(idx) {
  document.querySelectorAll(".char-card").forEach((c, cIdx) => {
    c.classList.toggle("active", cIdx === idx);
  });
  window.selectedCharacterIdx = idx;
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