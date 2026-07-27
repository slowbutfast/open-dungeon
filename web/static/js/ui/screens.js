import { showConfirm } from './toast.js';
import { scrollToBottom } from '../utils.js';

const SCREEN_IDS = [
  "startup-screen", "preset-screen", "custom-preset-screen",
  "character-screen", "restore-screen", "preset-manager-screen",
  "preset-editor-screen", "gameplay-screen"
];

export function toggleCrt() {
  document.body.classList.toggle("crt-effect");
  document.body.classList.toggle("theme-plain");
  const isCrtActive = document.body.classList.contains("crt-effect");
  const crtBtnGameplay = document.getElementById("btn-toggle-crt-gameplay");
  if (crtBtnGameplay) {
    crtBtnGameplay.classList.toggle("active", isCrtActive);
  }
}

export function showScreen(screenId) {
  SCREEN_IDS.forEach(s => {
    const el = document.getElementById(s);
    if (s === screenId) {
      el.classList.remove("hidden");
      el.classList.add("active");
      if (s === "gameplay-screen") {
        el.classList.remove("hidden");
        el.classList.add("game-dashboard");
      }
    } else {
      el.classList.add("hidden");
      el.classList.remove("active", "game-dashboard");
    }
  });

  // Update progress indicator
  updateProgressIndicator(screenId);

  // Set focus on the appropriate element
  if (screenId === "gameplay-screen") {
    scrollToBottom();
    document.getElementById("console-input").focus();
  } else if (screenId === "startup-screen") {
    const buttons = [
      document.getElementById("btn-new-game"),
      document.getElementById("btn-restore-game"),
      document.getElementById("btn-toggle-crt")
    ];
    buttons.forEach(btn => {
      btn.classList.remove("menu-focus");
      btn.blur();
    });
  } else if (screenId === "preset-screen") {
    focusFirstCard(screenId, ".preset-card", "btn-preset-next");
  } else if (screenId === "character-screen") {
    focusFirstCard(screenId, ".char-card", "btn-submit-character");
  } else if (screenId === "preset-manager-screen") {
    focusFirstCard(screenId, "#preset-manager-list .preset-card", "btn-create-preset");
  } else if (screenId === "preset-editor-screen") {
    const firstInput = document.querySelector("#preset-editor-screen .form-group input, #preset-editor-screen .form-group textarea");
    if (firstInput) firstInput.focus();
  } else if (screenId === "custom-preset-screen") {
    const firstInput = document.querySelector("#custom-preset-screen .form-group input, #custom-preset-screen .form-group textarea");
    if (firstInput) firstInput.focus();
  }
}

function updateProgressIndicator(screenId) {
  const wizardScreens = ["preset-screen", "custom-preset-screen", "character-screen"];
  if (!wizardScreens.includes(screenId)) return;

  const indicator = document.querySelector(`#${screenId} .progress-indicator`);
  if (!indicator) return;

  const steps = indicator.querySelectorAll(".progress-step");
  const currentStep = parseInt(indicator.dataset.step, 10);

  steps.forEach((step, idx) => {
    const stepNum = idx + 1;
    step.classList.remove("active", "completed");
    if (stepNum === currentStep) {
      step.classList.add("active");
    } else if (stepNum < currentStep) {
      step.classList.add("completed");
    }
  });
}

function focusFirstCard(screenId, cardSelector, fallbackBtnId) {
  const screen = document.getElementById(screenId);
  if (!screen) return;
  const firstCard = screen.querySelector(cardSelector);
  if (firstCard) {
    firstCard.focus();
  } else {
    const fallback = document.getElementById(fallbackBtnId);
    if (fallback) fallback.focus();
  }
}

export function openModal(modalId) {
  document.getElementById(modalId).classList.remove("hidden");
}

export function closeModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

export function switchSidebarTab(tabName) {
  document.getElementById("tab-btn-lore").classList.toggle("active", tabName === "lore");
  document.getElementById("tab-btn-memory").classList.toggle("active", tabName === "memory");
  document.getElementById("tab-btn-debug").classList.toggle("active", tabName === "debug");
  document.getElementById("tab-lore").classList.toggle("active", tabName === "lore");
  document.getElementById("tab-memory").classList.toggle("active", tabName === "memory");
  document.getElementById("tab-debug").classList.toggle("active", tabName === "debug");

  if (tabName === "debug") {
    window.pollDebugData();
  }
}

export async function returnToStartMenu() {
  const confirmed = await showConfirm("Disconnect simulation channel? Connection progress is saved automatically.");
  if (confirmed) {
    showScreen("startup-screen");
  }
}

export function getActiveScreenId() {
  for (const s of SCREEN_IDS) {
    const el = document.getElementById(s);
    if (el && !el.classList.contains("hidden")) {
      return s;
    }
  }
  return null;
}