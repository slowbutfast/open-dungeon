import { cleanMarkdownText, scrollToBottom, escapeHtml } from '../utils.js';

export function renderState(state, skipLastAssistant = false) {
  document.getElementById("val-location").innerText = state.location;
  document.getElementById("val-score").innerText = state.score;
  document.getElementById("val-moves").innerText = state.moves;
  document.getElementById("val-title").innerText = state.title;

  if (state.max_tokens !== undefined) {
    const slider = document.getElementById("token-limit-slider");
    const valSpan = document.getElementById("token-limit-val");
    if (slider && valSpan) {
      slider.value = state.max_tokens;
      valSpan.innerText = state.max_tokens;
    }
  }

  if (state.model !== undefined) {
    const select = document.getElementById("model-selection-select");
    if (select) {
      select.value = state.model;
    }
  }

  const log = document.getElementById("console-log");
  log.innerHTML = "";

  let history = state.history;
  if (skipLastAssistant) {
    const lastAssistantIdx = history.map(t => t.role).lastIndexOf("assistant");
    if (lastAssistantIdx !== -1) {
      history = history.filter((_, i) => i !== lastAssistantIdx);
    }
  }

  history.forEach(turn => {
    const turnDiv = document.createElement("div");
    turnDiv.className = `log-turn log-turn-${turn.role}`;

    if (turn.role === "user") {
      if (turn.text.startsWith("Character description:") || turn.text.startsWith("System update:")) {
        turnDiv.className = "log-turn log-turn-system";
        turnDiv.innerText = turn.text;
      } else {
        turnDiv.innerText = turn.text;
      }
    } else {
      let text = turn.text;
      const statusMatch = text.match(/\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$/m);
      if (statusMatch) {
        text = text.replace(/\[Status:\s*(.*?)\s*\|\s*Score:\s*\d+\s*\]\n?/m, '').trim();
      }
      turnDiv.innerText = cleanMarkdownText(text);
    }
    log.appendChild(turnDiv);
  });

  renderLoreCards(state.cards);
  document.getElementById("summary-editor").value = state.summary;
  renderSuggestions(state.suggestions);
  scrollToBottom();
}

export function renderSuggestions(list) {
  const box = document.getElementById("suggestions-box");
  const container = document.getElementById("suggestions-list");
  container.innerHTML = "";

  if (!list || list.length === 0) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");
  list.forEach(s => {
    const chip = document.createElement("button");
    chip.className = "suggestion-chip";
    chip.innerText = s;
    chip.addEventListener("click", () => {
      document.getElementById("console-input").value = s;
      window.submitPlayerCommand();
    });
    container.appendChild(chip);
  });
}

export function renderLoreCards(cards) {
  const container = document.getElementById("lore-cards-list");
  container.innerHTML = "";

  if (!cards || cards.length === 0) {
    container.innerHTML = `<p class="help-text" style="text-align: center; margin-top: 2rem;">No active lore context cards in memory.</p>`;
    return;
  }

  cards.forEach((card, idx) => {
    const triggers = card.triggers || card.trigger_words || [];
    const cardDiv = document.createElement("div");
    cardDiv.className = "lore-card" + (card.active === false ? " inactive" : "");
    cardDiv.innerHTML = `
      <div class="lore-card-header">
        <h5>${card.name}</h5>
        <span class="lore-card-badge ${card.type}">${card.type}</span>
      </div>
      <p>${card.description || ""}</p>
      <div class="lore-card-footer">
        <span class="lore-card-triggers" title="${triggers.join(', ')}">Triggers: ${triggers.join(', ')}</span>
        <div class="lore-card-buttons">
          <button class="lore-card-btn btn-toggle">${card.active !== false ? 'Disable' : 'Enable'}</button>
          <button class="lore-card-btn btn-edit">Edit</button>
          <button class="lore-card-btn btn-delete" style="color:#ef4444;">Del</button>
        </div>
      </div>
    `;

    cardDiv.querySelector(".btn-toggle").addEventListener("click", () => window.toggleLoreCard(idx));
    cardDiv.querySelector(".btn-edit").addEventListener("click", () => window.editLoreCard(idx));
    cardDiv.querySelector(".btn-delete").addEventListener("click", () => window.deleteLoreCard(idx));

    container.appendChild(cardDiv);
  });
}

export function renderInventory(items) {
  const list = document.getElementById("inventory-list");
  if (!list) return;
  list.innerHTML = "";
  if (!items || items.length === 0) {
    list.innerHTML = `<p class="help-text" style="text-align: center; margin: 0.5rem 0;">[INVENTORY EMPTY]</p>`;
    return;
  }
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "inventory-item-card";

    const header = document.createElement("div");
    header.className = "inventory-item-header";
    header.innerHTML = `<span>${item.item_name} (x${item.quantity})</span><span class="inventory-item-type">${item.item_type}</span>`;
    card.appendChild(header);

    if (item.description) {
      const desc = document.createElement("div");
      desc.className = "inventory-item-desc";
      desc.innerText = item.description;
      card.appendChild(desc);
    }
    list.appendChild(card);
  });
}

export function renderEventsLog(events) {
  const list = document.getElementById("event-log-list");
  if (!list) return;
  list.innerHTML = "";
  if (!events || events.length === 0) {
    list.innerHTML = `<p class="help-text" style="text-align: center; margin: 0.5rem 0;">[NO EVENT LOG ENTRIES]</p>`;
    return;
  }
  events.forEach(evt => {
    const card = document.createElement("div");
    card.className = "event-log-card";

    const header = document.createElement("div");
    header.className = "event-log-header";
    const locStr = evt.location ? ` @ ${evt.location}` : "";
    header.innerHTML = `<span>${evt.event_type.toUpperCase()}${locStr}</span><span class="event-log-meta">Turn ${evt.turn_index}</span>`;
    card.appendChild(header);

    const summary = document.createElement("div");
    summary.className = "event-log-summary";
    summary.innerText = evt.summary;
    card.appendChild(summary);

    list.appendChild(card);
  });
}

export function renderMemoryStats(stats) {
  const grid = document.getElementById("memory-stats-grid");
  if (!grid) return;
  grid.innerHTML = `
    <div class="memory-stat-item"><span class="stat-label">Events</span><span class="stat-val">${stats.events}</span></div>
    <div class="memory-stat-item"><span class="stat-label">Items</span><span class="stat-val">${stats.inventory}</span></div>
    <div class="memory-stat-item"><span class="stat-label">Lore Cards</span><span class="stat-val">${stats.lore}</span></div>
    <div class="memory-stat-item"><span class="stat-label">Watermark</span><span class="stat-val">Turn ${stats.lastExtractedTurnIndex}</span></div>
  `;
}

export function renderLlmCalls(calls) {
  const listEl = document.getElementById("llm-calls-list");
  if (!listEl) return;

  if (!calls || calls.length === 0) {
    listEl.innerHTML = '<p class="no-calls-msg">[No active LLM transmissions detected]</p>';
    return;
  }

  const sorted = [...calls].sort((a, b) => b.id - a.id);

  listEl.innerHTML = sorted.map(call => {
    const durationStr = call.duration ? `${(call.duration / 1000).toFixed(2)}s` : "--";
    const statusClass = call.status;
    const promptSnippet = call.prompt ? call.prompt : "";

    return `
      <div class="llm-call-item" id="call-${call.id}">
        <div class="llm-call-header">
          <span class="llm-call-id">#${call.id}</span>
          <span class="llm-call-type">${call.type}</span>
          <span class="llm-call-status ${statusClass}">${call.status.toUpperCase()}</span>
        </div>
        <div class="llm-call-meta">
          <span>Time: ${new Date(call.timestamp).toLocaleTimeString()}</span>
          <span>Dur: ${durationStr}</span>
        </div>
        <button class="llm-call-prompt-toggle" onclick="toggleCallDetails(${call.id})">Toggle Details</button>
        <div class="llm-call-details hidden" id="call-details-${call.id}">${escapeHtml(promptSnippet)}</div>
      </div>
    `;
  }).join("");
}

export function renderDebugLogs(logs) {
  const listEl = document.getElementById("debug-logs-list");
  if (!listEl) return;

  if (!logs || logs.length === 0) {
    listEl.innerHTML = '<p class="no-logs-msg">[System log buffer empty]</p>';
    return;
  }

  listEl.innerHTML = logs.map(log => {
    return `
      <div class="debug-log-line">
        <span class="debug-log-timestamp">[${log.timestamp}]</span>
        <span class="debug-log-message">${escapeHtml(log.message)}</span>
      </div>
    `;
  }).join("");

  listEl.scrollTop = listEl.scrollHeight;
}

export function renderCostSummary(costData) {
  const inputEl = document.getElementById("cost-input-tokens");
  const outputEl = document.getElementById("cost-output-tokens");
  const totalEl = document.getElementById("cost-total-tokens");
  const costEl = document.getElementById("cost-estimated");
  const breakdownEl = document.getElementById("cost-breakdown");

  if (inputEl) inputEl.innerText = (costData.session_input_tokens || costData.input_tokens || 0).toLocaleString();
  if (outputEl) outputEl.innerText = (costData.session_output_tokens || costData.output_tokens || 0).toLocaleString();
  if (totalEl) totalEl.innerText = ((costData.session_input_tokens || costData.input_tokens || 0) + (costData.session_output_tokens || costData.output_tokens || 0)).toLocaleString();
  if (costEl) costEl.innerText = `$${(costData.session_cost || costData.estimated_cost_usd || 0).toFixed(6)}`;
  if (breakdownEl) breakdownEl.innerText = costData.session_cost_display || "Pricing based on DeepSeek V4 rates ($0.40/M in, $1.10/M out)";
}