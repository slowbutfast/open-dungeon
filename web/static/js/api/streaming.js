import { scrollToBottom, cleanMarkdownText } from '../utils.js';
import { openModal, switchSidebarTab, returnToStartMenu } from '../ui/screens.js';
import { renderState, renderLoreCards, renderCostSummary } from '../ui/renderers.js';
import { syncMemoryAndLore } from './memory.js';

export function setConsoleDisabled(disabled) {
  document.getElementById("console-input").disabled = disabled;
  document.getElementById("btn-send").disabled = disabled;
  document.getElementById("btn-undo").disabled = disabled;
  document.getElementById("btn-retry").disabled = disabled;
  document.getElementById("btn-continue").disabled = disabled;
  document.getElementById("btn-scan").disabled = disabled;
  document.getElementById("btn-system-edit").disabled = disabled;
  document.getElementById("btn-menu").disabled = disabled;
}

export async function triggerUtilityAction(actionType) {
  if (actionType === "undo") {
    setConsoleDisabled(true);
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_type: "undo" })
      });
      const data = await res.json();
      if (data.status === "success") {
        await window.syncState();
      } else {
        alert("Undo failed: " + data.message);
      }
    } catch (err) {
      alert("Undo failed: " + err);
    } finally {
      setConsoleDisabled(false);
    }
  } else if (actionType === "retry") {
    await executeStreamAction("retry", "");
  } else if (actionType === "continue") {
    await executeStreamAction("continue", "");
  }
}

async function revealAssistantText(log, text) {
  const turnDiv = document.createElement("div");
  turnDiv.className = "log-turn log-turn-assistant";

  const revealedSpan = document.createElement("span");
  revealedSpan.className = "revealed-text";
  revealedSpan.innerText = "";

  const placeholderSpan = document.createElement("span");
  placeholderSpan.className = "hidden-placeholder";
  placeholderSpan.innerText = text;

  turnDiv.appendChild(revealedSpan);
  turnDiv.appendChild(placeholderSpan);
  log.appendChild(turnDiv);
  scrollToBottom();

  let revealedCount = 0;
  const CHAR_DELAY_MS = 4;

  function revealNextChar() {
    if (revealedCount >= text.length) {
      turnDiv.innerHTML = "";
      turnDiv.innerText = text;
      scrollToBottom();
      syncMemoryAndLore();
      return;
    }
    revealedCount++;
    revealedSpan.innerText = text.slice(0, revealedCount);
    placeholderSpan.innerText = text.slice(revealedCount);
    scrollToBottom();
    setTimeout(revealNextChar, CHAR_DELAY_MS);
  }

  revealNextChar();
}

export async function executeStreamAction(actionType, text) {
  document.getElementById("suggestions-box").classList.add("hidden");

  const log = document.getElementById("console-log");
  const loaderDiv = document.createElement("div");
  loaderDiv.className = "log-turn log-turn-system";
  loaderDiv.id = "stream-loader-indicator";
  loaderDiv.innerText = "[RECEIVING TRANSMISSION...]";
  log.appendChild(loaderDiv);
  scrollToBottom();

  setConsoleDisabled(true);

  let fullText = "";
  let sessionCost = null;

  try {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_type: actionType, text: text })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          let event;
          try {
            event = JSON.parse(line.substring(6));
          } catch (parseErr) {
            console.error("[STREAM_PARSE_ERROR] Failed to parse SSE event chunk:", parseErr, { rawLine: line });
            continue;
          }

          if (event.type === "chunk") {
            fullText += event.content;
          } else if (event.type === "cost") {
            sessionCost = event;
          } else if (event.type === "system") {
            const contentLower = event.content.toLowerCase();
            const isMemoryRecall = contentLower.includes("memory recall");
            const isLoreActivated = contentLower.includes("lore activated");
            const isCompression = contentLower.includes("compress") || contentLower.includes("summariz");

            if (!(isMemoryRecall || isLoreActivated || isCompression)) {
              const sysDiv = document.createElement("div");
              sysDiv.className = "log-turn log-turn-system";
              sysDiv.innerText = `[SYSTEM: ${event.content}]`;
              log.appendChild(sysDiv);
              scrollToBottom();
            }
          } else if (event.type === "error") {
            console.error("[STREAM_ERROR_EVENT] Received error payload from stream:", event.content);
            alert("Stream error: " + event.content);
          }
        }
      }
    }

    const loaderEl = document.getElementById("stream-loader-indicator");
    if (loaderEl) loaderEl.remove();

    const resState = await fetch("/api/state");
    const state = await resState.json();
    window.currentGameState = state;

    renderState(state, true);

    if (fullText.trim().length > 0) {
      const cleaned = cleanMarkdownText(fullText);
      revealAssistantText(log, cleaned);
    }

    if (sessionCost) {
      renderCostSummary(sessionCost);
    }

  } catch (err) {
    console.error("[STREAM_PROCESSING_ERROR] Critical failure in response stream processing:", err);
    const loaderEl = document.getElementById("stream-loader-indicator");
    if (loaderEl) loaderEl.remove();
    alert("Network action request error: " + err);
    try {
      const resState = await fetch("/api/state");
      const state = await resState.json();
      window.currentGameState = state;
      renderState(state);
    } catch (e) {
      // ignore
    }
  } finally {
    setConsoleDisabled(false);
  }
}

export async function submitPlayerCommand() {
  const input = document.getElementById("console-input");
  const commandText = input.value.trim();
  if (!commandText) return;

  input.value = "";
  window.historyIndex = -1;
  window.commandHistory.push(commandText);

  const log = document.getElementById("console-log");

  const normalized = commandText.replace(/^\\/, "/");

  if (normalized.startsWith("/")) {
    const parts = normalized.split(" ");
    const cmd = parts[0].toLowerCase();

    if (cmd !== "/continue") {
      const userDiv = document.createElement("div");
      userDiv.className = "log-turn log-turn-user";
      userDiv.innerText = `> ${commandText}`;
      log.appendChild(userDiv);
      scrollToBottom();
    }

    if (cmd === "/undo") {
      await triggerUtilityAction("undo");
      return;
    } else if (cmd === "/retry") {
      await triggerUtilityAction("retry");
      return;
    } else if (cmd === "/continue") {
      await triggerUtilityAction("continue");
      return;
    } else if (cmd === "/scan") {
      await window.triggerLoreScan();
      return;
    } else if (cmd === "/system") {
      if (window.currentGameState) {
        document.getElementById("system-prompt-editor").value = window.currentGameState.system_prompt;
        openModal("modal-system-prompt");
      }
      return;
    } else if (cmd === "/debug") {
      switchSidebarTab("debug");
      return;
    } else if (cmd === "/menu") {
      await returnToStartMenu();
      return;
    } else if (cmd === "/help") {
      const helpDiv = document.createElement("div");
      helpDiv.className = "log-turn log-turn-system";
      helpDiv.innerText = `--- TERMINAL HANDBOOK ---
Welcome to OpenDungeon!

GAMEPLAY ACTIONS:
  - Just type your action directly (e.g. "open mailbox", "go north").
  - Do not use slash command prefixes for normal gameplay.

SYSTEM COMMANDS:
  - /undo         : Revert your last action and the AI's response.
  - /retry        : Regenerate the AI's last response.
  - /continue     : Let the story generate a response on its own.
  - /scan         : Scans recent history and auto-generates character/location Lore Cards.
  - /system       : View or edit the active Dungeon Master system prompt.
  - /debug        : Switch to the LLM and RAG debug dashboard panel.
  - /menu         : Save and return to the main startup menu.
  - /help         : View this handbook.`;
      log.appendChild(helpDiv);
      scrollToBottom();
      return;
    } else if (cmd !== "/say" && cmd !== "/do") {
      const errDiv = document.createElement("div");
      errDiv.className = "log-turn log-turn-error";
      errDiv.innerText = `[SYSTEM ERROR: Unknown command "${cmd}". Type /help for assistance.]`;
      log.appendChild(errDiv);
      scrollToBottom();
      return;
    }
  }

  let actionType = "do";
  let text = commandText;

  if (commandText.startsWith("say ")) {
    actionType = "say";
    text = commandText.substring(4);
  } else if (normalized.startsWith("/say ")) {
    actionType = "say";
    text = normalized.substring(5);
  } else if (normalized.startsWith("/do ")) {
    actionType = "do";
    text = normalized.substring(4);
  }

  const userDiv = document.createElement("div");
  userDiv.className = "log-turn log-turn-user";
  userDiv.innerText = `> ${commandText}`;
  log.appendChild(userDiv);
  scrollToBottom();

  await executeStreamAction(actionType, text);
}

export function handleConsoleKeydown(e) {
  if (e.key === "Enter") {
    submitPlayerCommand();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (window.commandHistory.length === 0) return;

    if (window.historyIndex === -1) {
      window.historyIndex = window.commandHistory.length - 1;
    } else if (window.historyIndex > 0) {
      window.historyIndex--;
    }
    document.getElementById("console-input").value = window.commandHistory[window.historyIndex];
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (window.commandHistory.length === 0) return;

    if (window.historyIndex !== -1) {
      if (window.historyIndex < window.commandHistory.length - 1) {
        window.historyIndex++;
        document.getElementById("console-input").value = window.commandHistory[window.historyIndex];
      } else {
        window.historyIndex = -1;
        document.getElementById("console-input").value = "";
      }
    }
  }
}