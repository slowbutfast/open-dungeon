import { showConfirm } from './toast.js';
import { scrollToBottom } from '../utils.js';

const SCREEN_IDS = [
  "startup-screen", "preset-screen", "custom-preset-screen",
  "character-screen", "restore-screen", "gameplay-screen"
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