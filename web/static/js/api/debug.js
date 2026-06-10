import { escapeHtml } from '../utils.js';
import { renderLlmCalls, renderDebugLogs } from '../ui/renderers.js';

let debugPollInterval = null;

export function toggleCallDetails(id) {
  const el = document.getElementById(`call-details-${id}`);
  if (el) {
    el.classList.toggle("hidden");
  }
}

export async function pollDebugData() {
  try {
    const res = await fetch("/api/debug/info");
    if (!res.ok) return;
    const data = await res.json();

    renderLlmCalls(data.calls);
    renderDebugLogs(data.logs);

    const hasActive = data.calls.some(c => c.status === "active");
    const pulseDot = document.getElementById("debug-pulse");
    if (pulseDot) {
      if (hasActive) {
        pulseDot.className = "debug-pulse-active";
      } else {
        pulseDot.className = "debug-pulse-inactive";
      }
    }
  } catch (e) {
    console.error("Error polling debug info:", e);
  }
}

export function startDebugPolling() {
  if (!debugPollInterval) {
    pollDebugData();
    debugPollInterval = setInterval(pollDebugData, 1500);
  }
}

export function stopDebugPolling() {
  if (debugPollInterval) {
    clearInterval(debugPollInterval);
    debugPollInterval = null;
  }
}