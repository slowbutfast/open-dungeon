import { getState, updateState, subscribe, resetState } from './state.js';
import { cleanMarkdownText, scrollToBottom, escapeHtml } from './utils.js';
import * as Toast from './ui/toast.js';
import * as Screens from './ui/screens.js';
import * as Renderers from './ui/renderers.js';
import * as SavesAPI from './api/saves.js';
import * as SettingsAPI from './api/settings.js';
import * as PresetsAPI from './api/presets.js';
import * as LoreAPI from './api/lore.js';
import * as MemoryAPI from './api/memory.js';
import * as StreamingAPI from './api/streaming.js';
import * as DebugAPI from './api/debug.js';
import { _confirmResolve } from './ui/toast.js';

Object.assign(window, {
  ...Toast, ...Screens, ...Renderers, ...SavesAPI,
  ...SettingsAPI, ...PresetsAPI, ...LoreAPI, ...MemoryAPI,
  ...StreamingAPI, ...DebugAPI,
  getState, updateState, subscribe, resetState,
  cleanMarkdownText, scrollToBottom, escapeHtml,
  presets: [],
  selectedPresetIdx: null,
  selectedCharacterIdx: null,
  currentGameState: null,
  commandHistory: [],
  historyIndex: -1,
  storyCustomized: false,
  activeMenuIndex: -1
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-new-game").addEventListener("click", () => {
    window.selectedPresetIdx = null;
    window.storyCustomized = false;
    document.getElementById("btn-preset-customize").classList.add("hidden");
    document.getElementById("btn-preset-next").classList.add("hidden");
    PresetsAPI.loadPresets();
    Screens.showScreen("preset-screen");
  });

  document.getElementById("btn-restore-game").addEventListener("click", () => {
    SavesAPI.loadSavesList();
    Screens.showScreen("restore-screen");
  });

  document.getElementById("btn-toggle-crt").addEventListener("click", () => {
    Screens.toggleCrt();
  });

  document.getElementById("btn-toggle-crt-gameplay").addEventListener("click", () => {
    Screens.toggleCrt();
  });

  const startupButtons = [
    document.getElementById("btn-new-game"),
    document.getElementById("btn-restore-game"),
    document.getElementById("btn-toggle-crt")
  ];

  startupButtons.forEach((btn, idx) => {
    btn.addEventListener("focus", () => {
      window.activeMenuIndex = idx;
      startupButtons.forEach((b, i) => b.classList.toggle("menu-focus", i === idx));
    });
    btn.addEventListener("blur", () => {
      btn.classList.remove("menu-focus");
    });
  });

  document.getElementById("btn-preset-customize").addEventListener("click", () => {
    window.storyCustomized = true;
    Screens.showScreen("custom-preset-screen");
  });

  document.getElementById("btn-preset-next").addEventListener("click", () => {
    window.storyCustomized = false;
    PresetsAPI.loadCharactersList(window.selectedPresetIdx);
    Screens.showScreen("character-screen");
  });

  document.getElementById("btn-custom-preset").addEventListener("click", () => {
    window.selectedPresetIdx = null;
    window.storyCustomized = false;
    document.getElementById("custom-title").value = "Custom Quest";
    document.getElementById("custom-summary").value = "You stand at the beginning of a mysterious custom quest.";
    document.getElementById("custom-system-prompt").value = `You are the narrator for a custom text adventure game. Describe the world, obstacles, and results of actions in a sarcastic, direct, and concise tone in the style of Zork. Use the second-person perspective ("You"). At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: [Status: <Location Name> | Score: <Current Score>]`;
    Screens.showScreen("custom-preset-screen");
  });

  document.getElementById("btn-submit-custom-preset").addEventListener("click", () => {
    PresetsAPI.loadCharactersList(window.selectedPresetIdx);
    Screens.showScreen("character-screen");
  });

  document.getElementById("btn-char-custom-toggle").addEventListener("click", () => {
    const customForm = document.getElementById("custom-character-form");
    const presetSection = document.getElementById("preset-character-section");
    const isCustom = customForm.classList.contains("hidden");

    if (isCustom) {
      customForm.classList.remove("hidden");
      presetSection.classList.add("hidden");
      document.getElementById("btn-char-custom-toggle").innerText = "Select Preset Hero";

      let baseChar = null;
      let themeChars = [];

      if (window.selectedPresetIdx !== null && window.presets[window.selectedPresetIdx]) {
        themeChars = window.presets[window.selectedPresetIdx].characters || [];
      } else {
        themeChars = [
          {"name": "Valen", "type": "Warrior", "desc": "A strong fighter with a steel sword and shield.", "triggers": ["valen", "warrior"]},
          {"name": "Garrick", "type": "Mage", "desc": "A spellcaster wielding a wooden staff and fire spells.", "triggers": ["garrick", "mage"]},
          {"name": "Lyra", "type": "Rogue", "desc": "A stealthy thief wielding dual daggers.", "triggers": ["lyra", "rogue"]}
        ];
      }

      if (window.selectedCharacterIdx !== null && themeChars[window.selectedCharacterIdx]) {
        baseChar = themeChars[window.selectedCharacterIdx];
      } else if (themeChars.length > 0) {
        baseChar = themeChars[0];
      }

      if (baseChar) {
        document.getElementById("char-name").value = baseChar.name;
        document.getElementById("char-role").value = baseChar.type;
        document.getElementById("char-desc").value = baseChar.desc;
        document.getElementById("char-triggers").value = Array.isArray(baseChar.triggers) ? baseChar.triggers.join(", ") : baseChar.triggers;
      }

      window.selectedCharacterIdx = null;
    } else {
      customForm.classList.add("hidden");
      presetSection.classList.remove("hidden");
      document.getElementById("btn-char-custom-toggle").innerText = "Customize Character";
      window.selectedCharacterIdx = 0;
      PresetsAPI.selectCharacterCard(0);
    }
  });

  document.getElementById("btn-char-back").addEventListener("click", () => {
    if (window.selectedPresetIdx === null) {
      Screens.showScreen("custom-preset-screen");
    } else {
      Screens.showScreen("preset-screen");
    }
  });

  document.getElementById("btn-submit-character").addEventListener("click", PresetsAPI.launchSimulation);

  const consoleInput = document.getElementById("console-input");
  consoleInput.addEventListener("keydown", StreamingAPI.handleConsoleKeydown);

  document.getElementById("btn-send").addEventListener("click", StreamingAPI.submitPlayerCommand);

  document.getElementById("btn-undo").addEventListener("click", () => StreamingAPI.triggerUtilityAction("undo"));
  document.getElementById("btn-retry").addEventListener("click", () => StreamingAPI.triggerUtilityAction("retry"));
  document.getElementById("btn-continue").addEventListener("click", () => StreamingAPI.triggerUtilityAction("continue"));
  document.getElementById("btn-scan").addEventListener("click", LoreAPI.triggerLoreScan);
  document.getElementById("btn-menu").addEventListener("click", Screens.returnToStartMenu);
  document.getElementById("btn-debug-toggle").addEventListener("click", () => Screens.switchSidebarTab("debug"));

  document.getElementById("btn-system-edit").addEventListener("click", () => {
    if (window.currentGameState) {
      document.getElementById("system-prompt-editor").value = window.currentGameState.system_prompt;
      Screens.openModal("modal-system-prompt");
    }
  });

  document.getElementById("btn-save-system-prompt").addEventListener("click", SettingsAPI.saveSystemPrompt);

  document.getElementById("btn-save-summary").addEventListener("click", SettingsAPI.saveSummaryMemory);

  document.getElementById("btn-add-lore").addEventListener("click", () => {
    document.getElementById("lore-modal-title").innerText = "[ADD LORE BOOK CARD]";
    document.getElementById("lore-card-index").value = "";
    document.getElementById("lore-name").value = "";
    document.getElementById("lore-type").value = "character";
    document.getElementById("lore-desc").value = "";
    document.getElementById("lore-triggers").value = "";
    Screens.openModal("modal-lore-card");
  });

  document.getElementById("btn-save-lore-card").addEventListener("click", LoreAPI.saveLoreCard);

  document.getElementById("btn-confirm-yes").addEventListener("click", () => {
    document.getElementById("modal-confirm").classList.add("hidden");
    if (_confirmResolve) _confirmResolve(true);
  });

  document.getElementById("btn-confirm-no").addEventListener("click", () => {
    document.getElementById("modal-confirm").classList.add("hidden");
    if (_confirmResolve) _confirmResolve(false);
  });

  const tokenSlider = document.getElementById("token-limit-slider");
  const tokenVal = document.getElementById("token-limit-val");
  tokenSlider.addEventListener("input", () => {
    tokenVal.innerText = tokenSlider.value;
  });
  tokenSlider.addEventListener("change", async () => {
    const val = parseInt(tokenSlider.value);
    tokenVal.innerText = val;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_tokens: val })
    });
    const data = await res.json();
    if (data.status === "success") {
      Toast.showToast(`Max tokens set to ${val}`);
    } else {
      Toast.showToast("Failed to update token limit", true);
    }
  });

  const modelSelect = document.getElementById("model-selection-select");
  if (modelSelect) {
    modelSelect.addEventListener("change", async () => {
      const val = modelSelect.value;
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: val })
      });
      const data = await res.json();
      if (data.status === "success") {
        Toast.showToast(`Model set to: ${val}`);
        await MemoryAPI.syncState();
      } else {
        Toast.showToast("Failed to update model", true);
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    const confirmModal = document.getElementById("modal-confirm");
    if (confirmModal && !confirmModal.classList.contains("hidden")) {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("btn-confirm-yes").click();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        document.getElementById("btn-confirm-no").click();
        return;
      }
    }

    const activeScreen = Screens.getActiveScreenId();
    if (!activeScreen) return;

    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
      return;
    }

    const key = e.key;

    if (key.toLowerCase() === "t") {
      e.preventDefault();
      Screens.toggleCrt();
      return;
    }

    if (activeScreen === "gameplay-screen") return;

    if (activeScreen === "startup-screen") {
      const buttons = [
        document.getElementById("btn-new-game"),
        document.getElementById("btn-restore-game"),
        document.getElementById("btn-toggle-crt")
      ];
      if (key === "1") { e.preventDefault(); buttons[0].click(); }
      else if (key === "2") { e.preventDefault(); buttons[1].click(); }
      else if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter") {
        handleArrowNavigation(e, buttons);
      }

    } else if (activeScreen === "preset-screen") {
      const cards = Array.from(document.querySelectorAll(".preset-card"));
      const activeIdx = cards.findIndex(c => c.classList.contains("active"));
      if (key === "ArrowRight" || key === "ArrowDown") {
        e.preventDefault();
        const next = (activeIdx + 1) % cards.length;
        cards[next].click();
        cards[next].scrollIntoView({ block: "nearest" });
      } else if (key === "ArrowLeft" || key === "ArrowUp") {
        e.preventDefault();
        const prev = (activeIdx - 1 + cards.length) % cards.length;
        cards[prev].click();
        cards[prev].scrollIntoView({ block: "nearest" });
      } else if (key === "Enter") {
        e.preventDefault();
        const btnNext = document.getElementById("btn-preset-next");
        if (btnNext && !btnNext.classList.contains("hidden") && window.selectedPresetIdx !== null) {
          btnNext.click();
        }
      } else if (key === "Escape") {
        e.preventDefault();
        Screens.showScreen("startup-screen");
      }

    } else if (activeScreen === "character-screen") {
      const cards = Array.from(document.querySelectorAll(".char-card"));
      const activeIdx = cards.findIndex(c => c.classList.contains("active"));
      if (key === "ArrowRight" || key === "ArrowDown") {
        e.preventDefault();
        if (cards.length > 0) {
          const next = (activeIdx + 1) % cards.length;
          cards[next].click();
        }
      } else if (key === "ArrowLeft" || key === "ArrowUp") {
        e.preventDefault();
        if (cards.length > 0) {
          const prev = (activeIdx - 1 + cards.length) % cards.length;
          cards[prev].click();
        }
      } else if (key === "Enter") {
        e.preventDefault();
        document.getElementById("btn-submit-character").click();
      } else if (key === "Escape") {
        e.preventDefault();
        document.getElementById("btn-char-back").click();
      }

    } else if (activeScreen === "restore-screen") {
      if (key === "Escape") {
        e.preventDefault();
        Screens.showScreen("startup-screen");
      }

    } else if (activeScreen === "custom-preset-screen") {
      if (key === "Escape") {
        e.preventDefault();
        Screens.showScreen("preset-screen");
      }
    }
  });

  SettingsAPI.pingLlm();
  DebugAPI.startDebugPolling();
});

function handleArrowNavigation(e, buttons) {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();

    if (e.key === "ArrowDown") {
      if (window.activeMenuIndex === -1) {
        window.activeMenuIndex = 0;
      } else {
        window.activeMenuIndex = (window.activeMenuIndex + 1) % buttons.length;
      }
    } else if (e.key === "ArrowUp") {
      if (window.activeMenuIndex === -1) {
        window.activeMenuIndex = buttons.length - 1;
      } else {
        window.activeMenuIndex = (window.activeMenuIndex - 1 + buttons.length) % buttons.length;
      }
    }

    buttons[window.activeMenuIndex].focus();
  } else if (e.key === "Enter") {
    if (window.activeMenuIndex !== -1) {
      e.preventDefault();
      buttons[window.activeMenuIndex].click();
    }
  }
}