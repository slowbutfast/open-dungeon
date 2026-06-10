// Retro Neural Adventure Link Controller

// Application State variables
let presets = [];
let selectedPresetIdx = null;
let selectedCharacterIdx = null;
let currentGameState = null;
let commandHistory = [];
let historyIndex = -1;
let confirmResolve = null;
let storyCustomized = false;
let activeMenuIndex = -1;
let toastTimer = null;

// Toggle CRT screen scanlines and flicker classes on body
function toggleCrt() {
    document.body.classList.toggle("crt-effect");
    document.body.classList.toggle("theme-plain");
    
    // Sync the gameplay /crt utility button active class (if it exists)
    const isCrtActive = document.body.classList.contains("crt-effect");
    const crtBtnGameplay = document.getElementById("btn-toggle-crt-gameplay");
    if (crtBtnGameplay) {
        crtBtnGameplay.classList.toggle("active", isCrtActive);
    }
}

// In-page retro toast notification
function showToast(message, isError = false) {
    const toast = document.getElementById("toast-notification");
    toast.innerText = message;
    toast.classList.remove("toast-show", "toast-error");
    if (isError) toast.classList.add("toast-error");
    // Force reflow so transition always fires
    void toast.offsetWidth;
    toast.classList.add("toast-show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("toast-show", "toast-error");
    }, 2800);
}

// DOMContentLoaded Entry point
document.addEventListener("DOMContentLoaded", () => {
    // Setup event listeners for startup screen
    document.getElementById("btn-new-game").addEventListener("click", () => {
        selectedPresetIdx = null;
        storyCustomized = false;
        document.getElementById("btn-preset-customize").classList.add("hidden");
        document.getElementById("btn-preset-next").classList.add("hidden");
        loadPresets();
        showScreen("preset-screen");
    });
    
    document.getElementById("btn-restore-game").addEventListener("click", () => {
        loadSavesList();
        showScreen("restore-screen");
    });
    
    document.getElementById("btn-toggle-crt").addEventListener("click", () => {
        toggleCrt();
    });
    
    document.getElementById("btn-toggle-crt-gameplay").addEventListener("click", () => {
        toggleCrt();
    });

    const startupButtons = [
        document.getElementById("btn-new-game"),
        document.getElementById("btn-restore-game"),
        document.getElementById("btn-toggle-crt")
    ];
    
    startupButtons.forEach((btn, idx) => {
        btn.addEventListener("focus", () => {
            activeMenuIndex = idx;
            startupButtons.forEach((b, i) => b.classList.toggle("menu-focus", i === idx));
        });
        btn.addEventListener("blur", () => {
            btn.classList.remove("menu-focus");
        });
    });

    // Preset selection buttons
    document.getElementById("btn-preset-customize").addEventListener("click", () => {
        storyCustomized = true;
        showScreen("custom-preset-screen");
    });
    
    document.getElementById("btn-preset-next").addEventListener("click", () => {
        storyCustomized = false;
        loadCharactersList(selectedPresetIdx);
        showScreen("character-screen");
    });

    // Custom preset configuration submit
    document.getElementById("btn-custom-preset").addEventListener("click", () => {
        selectedPresetIdx = null; // Mark as custom preset
        storyCustomized = false;
        document.getElementById("custom-title").value = "Custom Quest";
        document.getElementById("custom-summary").value = "You stand at the beginning of a mysterious custom quest.";
        document.getElementById("custom-system-prompt").value = `You are the narrator for a custom text adventure game. Describe the world, obstacles, and results of actions in a sarcastic, direct, and concise tone in the style of Zork. Use the second-person perspective ("You"). At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: [Status: <Location Name> | Score: <Current Score>]`;
        showScreen("custom-preset-screen");
    });

    document.getElementById("btn-submit-custom-preset").addEventListener("click", () => {
        loadCharactersList(selectedPresetIdx);
        showScreen("character-screen");
    });

    // Character screen custom character toggle button
    document.getElementById("btn-char-custom-toggle").addEventListener("click", () => {
        const customForm = document.getElementById("custom-character-form");
        const presetSection = document.getElementById("preset-character-section");
        const isCustom = customForm.classList.contains("hidden");
        
        if (isCustom) {
            customForm.classList.remove("hidden");
            presetSection.classList.add("hidden");
            document.getElementById("btn-char-custom-toggle").innerText = "Select Preset Hero";
            
            // Get base character to populate the custom fields
            let baseChar = null;
            let themeChars = [];
            
            if (selectedPresetIdx !== null && presets[selectedPresetIdx]) {
                themeChars = presets[selectedPresetIdx].characters || [];
            } else {
                themeChars = [
                    {"name": "Valen", "type": "Warrior", "desc": "A strong fighter with a steel sword and shield.", "triggers": ["valen", "warrior"]},
                    {"name": "Garrick", "type": "Mage", "desc": "A spellcaster wielding a wooden staff and fire spells.", "triggers": ["garrick", "mage"]},
                    {"name": "Lyra", "type": "Rogue", "desc": "A stealthy thief wielding dual daggers.", "triggers": ["lyra", "rogue"]}
                ];
            }
            
            // If the user has already selected a preset card, customize that one; otherwise use the first one
            if (selectedCharacterIdx !== null && themeChars[selectedCharacterIdx]) {
                baseChar = themeChars[selectedCharacterIdx];
            } else if (themeChars.length > 0) {
                baseChar = themeChars[0];
            }
            
            if (baseChar) {
                document.getElementById("char-name").value = baseChar.name;
                document.getElementById("char-role").value = baseChar.type;
                document.getElementById("char-desc").value = baseChar.desc;
                document.getElementById("char-triggers").value = Array.isArray(baseChar.triggers) ? baseChar.triggers.join(", ") : baseChar.triggers;
            }
            
            selectedCharacterIdx = null; // Mark as custom character
        } else {
            customForm.classList.add("hidden");
            presetSection.classList.remove("hidden");
            document.getElementById("btn-char-custom-toggle").innerText = "Customize Character";
            selectedCharacterIdx = 0;
            // Select first preset
            selectCharacterCard(0);
        }
    });

    document.getElementById("btn-char-back").addEventListener("click", () => {
        if (selectedPresetIdx === null) {
            showScreen("custom-preset-screen");
        } else {
            showScreen("preset-screen");
        }
    });

    // Submit and launch game simulation
    document.getElementById("btn-submit-character").addEventListener("click", launchSimulation);

    // Gameplay commands and inputs
    const consoleInput = document.getElementById("console-input");
    consoleInput.addEventListener("keydown", handleConsoleKeydown);
    
    document.getElementById("btn-send").addEventListener("click", submitPlayerCommand);
    
    // Gameplay utility actions
    document.getElementById("btn-undo").addEventListener("click", () => triggerUtilityAction("undo"));
    document.getElementById("btn-retry").addEventListener("click", () => triggerUtilityAction("retry"));
    document.getElementById("btn-continue").addEventListener("click", () => triggerUtilityAction("continue"));
    document.getElementById("btn-scan").addEventListener("click", triggerLoreScan);
    document.getElementById("btn-menu").addEventListener("click", returnToStartMenu);
    document.getElementById("btn-debug-toggle").addEventListener("click", () => switchSidebarTab("debug"));
    
    document.getElementById("btn-system-edit").addEventListener("click", () => {
        if (currentGameState) {
            document.getElementById("system-prompt-editor").value = currentGameState.system_prompt;
            openModal("modal-system-prompt");
        }
    });

    // Save prompt rules changes
    document.getElementById("btn-save-system-prompt").addEventListener("click", saveSystemPrompt);

    // Sidebar save summary
    document.getElementById("btn-save-summary").addEventListener("click", saveSummaryMemory);

    // Sidebar add lore card button
    document.getElementById("btn-add-lore").addEventListener("click", () => {
        document.getElementById("lore-modal-title").innerText = "[ADD LORE BOOK CARD]";
        document.getElementById("lore-card-index").value = "";
        document.getElementById("lore-name").value = "";
        document.getElementById("lore-type").value = "character";
        document.getElementById("lore-desc").value = "";
        document.getElementById("lore-triggers").value = "";
        openModal("modal-lore-card");
    });

    // Modal save lore card
    document.getElementById("btn-save-lore-card").addEventListener("click", saveLoreCard);

    // Custom confirmation modal listeners
    document.getElementById("btn-confirm-yes").addEventListener("click", () => {
        document.getElementById("modal-confirm").classList.add("hidden");
        if (confirmResolve) confirmResolve(true);
    });
    
    document.getElementById("btn-confirm-no").addEventListener("click", () => {
        document.getElementById("modal-confirm").classList.add("hidden");
        if (confirmResolve) confirmResolve(false);
    });
    
    // Token limit slider
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
            showToast(`Max tokens set to ${val}`);
        } else {
            showToast("Failed to update token limit", true);
        }
    });

    // Model selection dropdown
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
                showToast(`Model set to: ${val}`);
                await syncState();
            } else {
                showToast("Failed to update model", true);
            }
        });
    }

    // Global keyboard navigation and shortcut listener
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

        const activeScreen = getActiveScreenId();
        if (!activeScreen) return;
        
        // If typing in any input field or textarea, do not intercept
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
            return;
        }
        
        const key = e.key;
        
        // Global T/t shortcut to toggle CRT scanlines on any screen!
        if (key.toLowerCase() === "t") {
            e.preventDefault();
            toggleCrt();
            return;
        }
        
        // If we are in gameplay screen, let the console input handle keypresses
        if (activeScreen === "gameplay-screen") return;
        
        if (activeScreen === "startup-screen") {
            const buttons = [
                document.getElementById("btn-new-game"),
                document.getElementById("btn-restore-game"),
                document.getElementById("btn-toggle-crt")
            ];
            if (key === "1") { e.preventDefault(); buttons[0].click(); }
            else if (key === "2") { e.preventDefault(); buttons[1].click(); }
            else if (key.toLowerCase() === "t") { e.preventDefault(); buttons[2].click(); }
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
                if (btnNext && !btnNext.classList.contains("hidden") && selectedPresetIdx !== null) {
                    btnNext.click();
                }
            } else if (key === "Escape") {
                e.preventDefault();
                showScreen("startup-screen");
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
                showScreen("startup-screen");
            }

        } else if (activeScreen === "custom-preset-screen") {
            if (key === "Escape") {
                e.preventDefault();
                showScreen("preset-screen");
            }
        }
    });

    // Sync CRT button active state on load (body starts with crt-effect class)
    const isCrtActive = document.body.classList.contains("crt-effect");
    const crtBtnGameplay = document.getElementById("btn-toggle-crt-gameplay");
    if (crtBtnGameplay) {
        crtBtnGameplay.classList.toggle("active", isCrtActive);
    }

    // Probe LLM host and update status pill
    pingLlm();

    // Start polling debug information
    startDebugPolling();
});

// Probe the LLM host and update the status pill on the startup screen
async function pingLlm() {
    const pill = document.getElementById("llm-status-pill");
    if (!pill) return;
    try {
        const res = await fetch("/api/ping");
        const data = await res.json();
        pill.className = "llm-pill llm-pill-" + data.status;
        
        // Populate model selector dropdown
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
            if (currentGameState && currentGameState.model) {
                select.value = currentGameState.model;
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
            pill.innerHTML = `&#9679; ONLINE &mdash; ${data.host}:${data.port} &mdash; ${shortModel}`;
        } else if (data.status === "mock") {
            pill.innerHTML = `&#9679; MOCK MODE &mdash; ${data.host}:${data.port}`;
        } else {
            pill.innerHTML = `&#9673; OFFLINE &mdash; ${data.host}:${data.port}`;
        }
    } catch {
        pill.className = "llm-pill llm-pill-offline";
        pill.innerHTML = "&#9673; OFFLINE";
    }
}


// Screen management helper
function showScreen(screenId) {
    const screens = [
        "startup-screen", "preset-screen", "custom-preset-screen",
        "character-screen", "restore-screen", "gameplay-screen"
    ];
    screens.forEach(s => {
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
        activeMenuIndex = -1;
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

// Modal management helper
function openModal(modalId) {
    document.getElementById(modalId).classList.remove("hidden");
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add("hidden");
}

// Tabs switching details
function switchSidebarTab(tabName) {
    document.getElementById("tab-btn-lore").classList.toggle("active", tabName === "lore");
    document.getElementById("tab-btn-memory").classList.toggle("active", tabName === "memory");
    document.getElementById("tab-btn-debug").classList.toggle("active", tabName === "debug");
    document.getElementById("tab-lore").classList.toggle("active", tabName === "lore");
    document.getElementById("tab-memory").classList.toggle("active", tabName === "memory");
    document.getElementById("tab-debug").classList.toggle("active", tabName === "debug");
    
    // Trigger immediate refresh of debug data if switching to debug tab
    if (tabName === "debug") {
        pollDebugData();
    }
}

// ----------------- WIZARD LOAD FUNCTIONS -----------------

async function loadPresets() {
    const listContainer = document.getElementById("preset-list");
    listContainer.innerHTML = `
        <div class="loader-container" style="grid-column: 1 / -1;">
            <div class="retro-spinner"></div>
            <span class="loader-text">[RETRIEVING SIMULATION TEMPLATES...]</span>
        </div>
    `;
    try {
        const res = await fetch("/api/presets");
        presets = await res.json();
        listContainer.innerHTML = "";
        
        presets.forEach((preset, idx) => {
            const card = document.createElement("div");
            card.className = "preset-card";
            card.innerHTML = `
                <h3>${preset.name}</h3>
                <p>${preset.summary.substring(0, 110)}...</p>
            `;
            card.addEventListener("click", () => {
                document.querySelectorAll(".preset-card").forEach(c => c.classList.remove("active"));
                card.classList.add("active");
                selectedPresetIdx = idx;
                
                // Populate the custom preset configuration form in case they want to customize it
                document.getElementById("custom-title").value = preset.title;
                document.getElementById("custom-summary").value = preset.summary;
                document.getElementById("custom-system-prompt").value = preset.system_prompt;
                
                // Show the action buttons for preset
                document.getElementById("btn-preset-customize").classList.remove("hidden");
                document.getElementById("btn-preset-next").classList.remove("hidden");
            });
            listContainer.appendChild(card);
        });
    } catch (err) {
        listContainer.innerHTML = `<p class="help-text" style="grid-column: 1 / -1; text-align: center; margin: 2rem 0; color: #ef4444;">Failed to load presets: ${err}</p>`;
    }
}

function loadCharactersList(presetIdx) {
    const grid = document.getElementById("character-grid");
    grid.innerHTML = "";
    
    let chars = [];
    if (presetIdx !== null && presets[presetIdx]) {
        chars = presets[presetIdx].characters;
    } else {
        // Generic starting options for custom presets
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
        card.addEventListener("click", () => selectCharacterCard(idx));
        grid.appendChild(card);
    });
    
    selectedCharacterIdx = 0;
    
    // Clear custom character forms
    document.getElementById("custom-character-form").classList.add("hidden");
    document.getElementById("preset-character-section").classList.remove("hidden");
    document.getElementById("btn-char-custom-toggle").innerText = "Create Custom Hero";
}

function selectCharacterCard(idx) {
    document.querySelectorAll(".char-card").forEach((c, cIdx) => {
        c.classList.toggle("active", cIdx === idx);
    });
    selectedCharacterIdx = idx;
}

// Load save games list
// Load save games list
async function loadSavesList() {
    const list = document.getElementById("save-list");
    list.innerHTML = `
        <div class="loader-container">
            <div class="retro-spinner"></div>
            <span class="loader-text">[SCANNING NEURAL CHANNELS FOR SECURED CONNECTIONS...]</span>
        </div>
    `;
    try {
        const res = await fetch("/api/saves");
        const saves = await res.json();
        list.innerHTML = "";
        
        if (saves.length === 0) {
            list.innerHTML = `<p class="help-text" style="text-align: center; margin: 2rem 0;">No active saved connections found.</p>`;
            return;
        }
        
        saves.forEach(save => {
            const item = document.createElement("div");
            item.className = "save-item";
            item.innerHTML = `
                <div class="save-details">
                    <h4>${save.title}</h4>
                    <p>Location: ${save.location} | Summary: ${save.summary.substring(0, 65)}...</p>
                    <div class="save-meta">Slot ID: ${save.id} // connection turns: ${save.turns}</div>
                </div>
                <div class="save-actions">
                    <button class="btn btn-primary btn-sm btn-restore">Restore</button>
                    <button class="btn btn-secondary btn-sm btn-delete" style="color:#ef4444;">Delete</button>
                </div>
            `;
            
            item.querySelector(".btn-restore").addEventListener("click", (e) => loadSaveGame(save.id, e.target));
            item.querySelector(".btn-delete").addEventListener("click", (e) => deleteSaveGame(save.id, e.target));
            
            list.appendChild(item);
        });
    } catch (err) {
        list.innerHTML = `<p class="help-text" style="text-align: center; margin: 2rem 0; color: #ef4444;">Failed to load saved games: ${err}</p>`;
    }
}

// ----------------- RESTORE SAVE API CALLS -----------------

async function loadSaveGame(saveId, btn) {
    const allButtons = document.querySelectorAll("#save-list button");
    allButtons.forEach(b => b.disabled = true);
    const originalText = btn.innerText;
    btn.innerText = "[STABILIZING LINK...]";
    try {
        const res = await fetch(`/api/saves/${saveId}`, { method: "POST" });
        const data = await res.json();
        if (data.status === "success") {
            await syncState();
            showScreen("gameplay-screen");
        } else {
            showToast("Restore failed: " + data.message, true);
        }
    } catch (err) {
        showToast("Restore failed: " + err, true);
    } finally {
        allButtons.forEach(b => b.disabled = false);
        btn.innerText = originalText;
    }
}

async function deleteSaveGame(saveId, btn) {
    const confirmed = await showConfirm("Permanently wipe this save simulation Connection?");
    if (confirmed) {
        const allButtons = document.querySelectorAll("#save-list button");
        allButtons.forEach(b => b.disabled = true);
        const originalText = btn.innerText;
        btn.innerText = "[WIPING...]";
        try {
            const res = await fetch(`/api/saves/${saveId}`, { method: "DELETE" });
            const data = await res.json();
            if (data.status === "success") {
                loadSavesList();
            } else {
                showToast("Failed to delete save slot: " + data.message, true);
            }
        } catch (err) {
            showToast("Failed to delete save slot: " + err, true);
        } finally {
            if (document.body.contains(btn)) {
                allButtons.forEach(b => b.disabled = false);
                btn.innerText = originalText;
            }
        }
    }
}

// Launch simulation genesis
async function launchSimulation() {
    const submitBtn = document.getElementById("btn-submit-character");
    const backBtn = document.getElementById("btn-char-back");
    const toggleBtn = document.getElementById("btn-char-custom-toggle");
    
    submitBtn.innerText = "CONNECTING NEURAL LINK...";
    submitBtn.disabled = true;
    backBtn.disabled = true;
    toggleBtn.disabled = true;
    
    try {
        const payload = {
            preset_idx: selectedPresetIdx,
            character: {}
        };
        
        // Customize configuration
        if (selectedPresetIdx === null || storyCustomized) {
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
            if (selectedPresetIdx !== null && presets[selectedPresetIdx]) {
                chars = presets[selectedPresetIdx].characters;
            } else {
                chars = [
                    {"name": "Valen", "type": "Warrior", "desc": "A strong fighter with a steel sword and shield.", "triggers": ["valen", "warrior"]},
                    {"name": "Garrick", "type": "Mage", "desc": "A spellcaster wielding a wooden staff and fire spells.", "triggers": ["garrick", "mage"]},
                    {"name": "Lyra", "type": "Rogue", "desc": "A stealthy thief wielding dual daggers.", "triggers": ["lyra", "rogue"]}
                ];
            }
            const selectedChar = chars[selectedCharacterIdx];
            payload.character = {
                name: selectedChar.name,
                type: selectedChar.type,
                desc: selectedChar.desc,
                triggers: selectedChar.triggers
            };
        }
        
        // Launch API init connection
        const res = await fetch("/api/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (data.status === "success") {
            await syncState();
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

// ----------------- GAME STATE SYNC & RENDER -----------------

async function syncState() {
    const res = await fetch("/api/state");
    const state = await res.json();
    currentGameState = state;
    renderState(state);
    await syncMemoryDetails();
}

function renderState(state, skipLastAssistant = false) {
    // 1. Render Status Bar
    document.getElementById("val-location").innerText = state.location;
    document.getElementById("val-score").innerText = state.score;
    document.getElementById("val-moves").innerText = state.moves;
    document.getElementById("val-title").innerText = state.title;
    
    // Sync token slider with server value
    if (state.max_tokens !== undefined) {
        const slider = document.getElementById("token-limit-slider");
        const valSpan = document.getElementById("token-limit-val");
        if (slider && valSpan) {
            slider.value = state.max_tokens;
            valSpan.innerText = state.max_tokens;
        }
    }
    
    // Sync model selection dropdown with server value
    if (state.model !== undefined) {
        const select = document.getElementById("model-selection-select");
        if (select) {
            select.value = state.model;
        }
    }
    
    // 2. Render History Log
    const log = document.getElementById("console-log");
    log.innerHTML = "";
    
    // When skipLastAssistant is true, omit the final assistant turn so the
    // caller can render it with the reveal animation instead
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
            // Check system formats
            if (turn.text.startsWith("Character description:") || turn.text.startsWith("System update:")) {
                turnDiv.className = "log-turn log-turn-system";
                turnDiv.innerText = turn.text;
            } else {
                turnDiv.innerText = turn.text;
            }
        } else {
            // Render text Markdown clean output
            turnDiv.innerText = cleanMarkdownText(turn.text);
        }
        log.appendChild(turnDiv);
    });
    
    // 3. Render Lore Cards
    renderLoreCards(state.cards);
    
    // 4. Render Memory Summary
    document.getElementById("summary-editor").value = state.summary;
    
    // 5. Render Suggestions
    renderSuggestions(state.suggestions);
    
    scrollToBottom();
}

function cleanMarkdownText(text) {
    // Basic formatting cleanups for rich Zork look
    return text.replace(/\*\*/g, "").replace(/\*/g, "");
}

function scrollToBottom() {
    const log = document.getElementById("console-log");
    log.scrollTop = log.scrollHeight;
}

function renderSuggestions(list) {
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
            submitPlayerCommand();
        });
        container.appendChild(chip);
    });
}

function renderLoreCards(cards) {
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
        
        cardDiv.querySelector(".btn-toggle").addEventListener("click", () => toggleLoreCard(idx));
        cardDiv.querySelector(".btn-edit").addEventListener("click", () => editLoreCard(idx));
        cardDiv.querySelector(".btn-delete").addEventListener("click", () => deleteLoreCard(idx));
        
        container.appendChild(cardDiv);
    });
}

// ----------------- GAME ACTIONS & SSE STREAMING -----------------

async function submitPlayerCommand() {
    const input = document.getElementById("console-input");
    const commandText = input.value.trim();
    if (!commandText) return;
    
    input.value = "";
    historyIndex = -1;
    commandHistory.push(commandText);
    
    const log = document.getElementById("console-log");
    
    // Intercept slash commands (supports only / prefix)
    if (commandText.startsWith("/")) {
        const parts = commandText.split(" ");
        const cmd = parts[0].toLowerCase();
        
        // Print user input command to console log if it is not /continue
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
            await triggerLoreScan();
            return;
        } else if (cmd === "/system") {
            if (currentGameState) {
                document.getElementById("system-prompt-editor").value = currentGameState.system_prompt;
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
Welcome to the Retro Neural Adventure Link!

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
    
    // Determine action types
    let actionType = "do";
    let text = commandText;
    
    if (commandText.startsWith("say ")) {
        actionType = "say";
        text = commandText.substring(4);
    } else if (commandText.startsWith("/say ")) {
        actionType = "say";
        text = commandText.substring(5);
    } else if (commandText.startsWith("/do ")) {
        actionType = "do";
        text = commandText.substring(4);
    }
    
    // Append user turn immediately inline
    const userDiv = document.createElement("div");
    userDiv.className = "log-turn log-turn-user";
    userDiv.innerText = `> ${commandText}`;
    log.appendChild(userDiv);
    scrollToBottom();
    
    await executeStreamAction(actionType, text);
}

function setConsoleDisabled(disabled) {
    document.getElementById("console-input").disabled = disabled;
    document.getElementById("btn-send").disabled = disabled;
    document.getElementById("btn-undo").disabled = disabled;
    document.getElementById("btn-retry").disabled = disabled;
    document.getElementById("btn-continue").disabled = disabled;
    document.getElementById("btn-scan").disabled = disabled;
    document.getElementById("btn-system-edit").disabled = disabled;
    // Keep CRT toggle button enabled during streaming actions
    document.getElementById("btn-menu").disabled = disabled;
}

async function executeStreamAction(actionType, text) {
    // Hide suggestions during streaming
    document.getElementById("suggestions-box").classList.add("hidden");
    
    // Append an inline loader line to the console log
    const log = document.getElementById("console-log");
    const loaderDiv = document.createElement("div");
    loaderDiv.className = "log-turn log-turn-system";
    loaderDiv.id = "stream-loader-indicator";
    loaderDiv.innerText = "[RECEIVING TRANSMISSION...]";
    log.appendChild(loaderDiv);
    scrollToBottom();
    
    setConsoleDisabled(true);
    
    let fullText = "";
    
    try {
        const response = await fetch("/api/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action_type: actionType, text: text })
        });
        
        // Handle stream body reader — accumulate all chunks
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop(); // Keep incomplete lines
            
            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const event = JSON.parse(line.substring(6));
                    
                    if (event.type === "chunk") {
                        // Accumulate into buffer — don't display yet
                        fullText += event.content;
                    } else if (event.type === "system") {
                        const contentLower = event.content.toLowerCase();
                        const isMemoryRecall = contentLower.includes("memory recall");
                        const isLoreActivated = contentLower.includes("lore activated");
                        const isCompression = contentLower.includes("compress") || contentLower.includes("summariz");
                        
                        if (isMemoryRecall || isLoreActivated || isCompression) {
                            // Quietly ignore for main CRT console
                            // (It will be visible in the DEBUG tab via polling)
                        } else {
                            // Render other system messages inline immediately
                            const sysDiv = document.createElement("div");
                            sysDiv.className = "log-turn log-turn-system";
                            sysDiv.innerText = `[SYSTEM: ${event.content}]`;
                            log.appendChild(sysDiv);
                            scrollToBottom();
                        }
                    } else if (event.type === "error") {
                        alert("Stream error: " + event.content);
                    }
                }
            }
        }
        
        // Remove the loader line now that stream is complete
        const loaderEl = document.getElementById("stream-loader-indicator");
        if (loaderEl) loaderEl.remove();
        
        // Fetch updated state
        const resState = await fetch("/api/state");
        const state = await resState.json();
        currentGameState = state;
        
        // Render full state history, skipping the last assistant turn
        // (it will be rendered by the reveal animation below)
        renderState(state, true);
        
        // Now do the character-by-character reveal of the last assistant response
        if (fullText.trim().length > 0) {
            const cleaned = cleanMarkdownText(fullText);
            revealAssistantText(log, cleaned);
        }
        
    } catch (err) {
        const loaderEl = document.getElementById("stream-loader-indicator");
        if (loaderEl) loaderEl.remove();
        alert("Network action request error: " + err);
        try {
            const resState = await fetch("/api/state");
            const state = await resState.json();
            currentGameState = state;
            renderState(state);
        } catch (e) {
            // ignore
        }
    } finally {
        setConsoleDisabled(false);
    }
}

/**
 * Appends an assistant turn div and runs a character-by-character reveal animation.
 * The unrevealed portion is shown as a green highlighted placeholder that shrinks
 * as each character is typed into the revealed span.
 */
function revealAssistantText(log, text) {
    const turnDiv = document.createElement("div");
    turnDiv.className = "log-turn log-turn-assistant";
    
    // Revealed span grows; placeholder span shrinks
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
    
    // Animate: reveal one character at a time
    let revealedCount = 0;
    const CHAR_DELAY_MS = 4; // Reveal much faster
    
    function revealNextChar() {
        if (revealedCount >= text.length) {
            // Animation complete — collapse to plain text node
            turnDiv.innerHTML = "";
            turnDiv.innerText = text;
            scrollToBottom();
            syncMemoryAndLore(); // Silently update lore cards and stats
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

// Sync sidebar memory details and cards from the backend silently
async function syncMemoryAndLore() {
    try {
        const res = await fetch("/api/state");
        const state = await res.json();
        currentGameState = state;
        
        // Update stats
        const locationEl = document.getElementById("val-location");
        const scoreEl = document.getElementById("val-score");
        const movesEl = document.getElementById("val-moves");
        const summaryEl = document.getElementById("summary-editor");
        
        if (locationEl) locationEl.innerText = state.location;
        if (scoreEl) scoreEl.innerText = state.score;
        if (movesEl) movesEl.innerText = state.moves;
        if (summaryEl) summaryEl.value = state.summary;
        
        // Update lore cards list
        renderLoreCards(state.cards);
        
        // Fetch and render other details from memory manager
        await syncMemoryDetails();
    } catch (e) {
        // quiet fail
    }
}

async function syncMemoryDetails() {
    try {
        const [resInv, resEvt, resStats] = await Promise.all([
            fetch("/api/memory/inventory"),
            fetch("/api/memory/events"),
            fetch("/api/memory/stats")
        ]);
        if (resInv.ok) {
            const items = await resInv.json();
            renderInventory(items);
        }
        if (resEvt.ok) {
            const events = await resEvt.json();
            renderEventsLog(events);
        }
        if (resStats.ok) {
            const stats = await resStats.json();
            renderMemoryStats(stats);
        }
    } catch (e) {
        // quiet fail
    }
}

function renderInventory(items) {
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

function renderEventsLog(events) {
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

function renderMemoryStats(stats) {
    const grid = document.getElementById("memory-stats-grid");
    if (!grid) return;
    grid.innerHTML = `
        <div class="memory-stat-item"><span class="stat-label">Events</span><span class="stat-val">${stats.events}</span></div>
        <div class="memory-stat-item"><span class="stat-label">Items</span><span class="stat-val">${stats.inventory}</span></div>
        <div class="memory-stat-item"><span class="stat-label">Lore Cards</span><span class="stat-val">${stats.lore}</span></div>
        <div class="memory-stat-item"><span class="stat-label">Watermark</span><span class="stat-val">Turn ${stats.lastExtractedTurnIndex}</span></div>
    `;
}

// Trigger utility operations
async function triggerUtilityAction(actionType) {
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
                await syncState();
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

// Run lore scan
async function triggerLoreScan() {
    const scanBtn = document.getElementById("btn-scan");
    const originalText = scanBtn.innerText;
    setConsoleDisabled(true);
    scanBtn.innerText = "/scan (scanning...)";
    
    // Append log feedback
    const log = document.getElementById("console-log");
    const sysDiv = document.createElement("div");
    sysDiv.className = "log-turn log-turn-system";
    sysDiv.innerText = "[SYSTEM: Scanning context to extract lorebook entities...]";
    log.appendChild(sysDiv);
    scrollToBottom();
    
    try {
        const res = await fetch("/api/scan", { method: "POST" });
        const data = await res.json();
        
        if (data.status === "success") {
            await syncState();
            const feedbackDiv = document.createElement("div");
            feedbackDiv.className = "log-turn log-turn-system";
            feedbackDiv.innerText = `[SYSTEM: ${data.message}]`;
            document.getElementById("console-log").appendChild(feedbackDiv);
            scrollToBottom();
        } else {
            showToast("Scan failed: " + data.message, true);
        }
    } catch (err) {
        showToast("Scan failed: " + err, true);
    } finally {
        setConsoleDisabled(false);
        scanBtn.innerText = originalText;
    }
}

// ----------------- SIDEBAR EDITOR SERVICES -----------------

async function saveSystemPrompt() {
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
            await syncState();
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

async function saveSummaryMemory() {
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
            await syncState();
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

// Lore cards modifiers
async function toggleLoreCard(idx) {
    const res = await fetch("/api/lore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", index: idx })
    });
    const data = await res.json();
    if (data.status === "success") {
        renderLoreCards(data.cards);
    }
}

async function deleteLoreCard(idx) {
    const confirmed = await showConfirm("Wipe this lore card from active simulation memory?");
    if (confirmed) {
        const res = await fetch("/api/lore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", index: idx })
        });
        const data = await res.json();
        if (data.status === "success") {
            renderLoreCards(data.cards);
        }
    }
}

function editLoreCard(idx) {
    if (!currentGameState || !currentGameState.cards[idx]) return;
    
    const card = currentGameState.cards[idx];
    document.getElementById("lore-modal-title").innerText = "[EDIT LORE BOOK CARD]";
    document.getElementById("lore-card-index").value = idx;
    document.getElementById("lore-name").value = card.name;
    document.getElementById("lore-type").value = card.type || "character";
    document.getElementById("lore-desc").value = card.description || "";
    const triggers = card.triggers || card.trigger_words || [];
    document.getElementById("lore-triggers").value = triggers.join(", ");
    
    openModal("modal-lore-card");
}

async function saveLoreCard() {
    const indexVal = document.getElementById("lore-card-index").value;
    const action = indexVal === "" ? "add" : "update";
    const index = indexVal === "" ? null : parseInt(indexVal);
    
    const payload = {
        action: action,
        index: index,
        card: {
            name: document.getElementById("lore-name").value,
            type: document.getElementById("lore-type").value,
            description: document.getElementById("lore-desc").value,
            triggers: document.getElementById("lore-triggers").value
        }
    };
    
    const res = await fetch("/api/lore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.status === "success") {
        closeModal("modal-lore-card");
        await syncState();
    } else {
        alert("Save failed: " + data.message);
    }
}

// Recall command history
function handleConsoleKeydown(e) {
    if (e.key === "Enter") {
        submitPlayerCommand();
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (commandHistory.length === 0) return;
        
        if (historyIndex === -1) {
            historyIndex = commandHistory.length - 1;
        } else if (historyIndex > 0) {
            historyIndex--;
        }
        document.getElementById("console-input").value = commandHistory[historyIndex];
    } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (commandHistory.length === 0) return;
        
        if (historyIndex !== -1) {
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                document.getElementById("console-input").value = commandHistory[historyIndex];
            } else {
                historyIndex = -1;
                document.getElementById("console-input").value = "";
            }
        }
    }
}

async function returnToStartMenu() {
    const confirmed = await showConfirm("Disconnect simulation channel? Connection progress is saved automatically.");
    if (confirmed) {
        showScreen("startup-screen");
    }
}

// Custom Promise-wrapped Confirmation Dialog
function showConfirm(message) {
    return new Promise((resolve) => {
        confirmResolve = resolve;
        document.getElementById("confirm-message").innerText = message;
        document.getElementById("modal-confirm").classList.remove("hidden");
    });
}

function getActiveScreenId() {
    const screens = [
        "startup-screen", "preset-screen", "custom-preset-screen",
        "character-screen", "restore-screen", "gameplay-screen"
    ];
    for (const s of screens) {
        const el = document.getElementById(s);
        if (el && !el.classList.contains("hidden")) {
            return s;
        }
    }
    return null;
}

function handleArrowNavigation(e, buttons) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        
        if (e.key === "ArrowDown") {
            if (activeMenuIndex === -1) {
                activeMenuIndex = 0;
            } else {
                activeMenuIndex = (activeMenuIndex + 1) % buttons.length;
            }
        } else if (e.key === "ArrowUp") {
            if (activeMenuIndex === -1) {
                activeMenuIndex = buttons.length - 1;
            } else {
                activeMenuIndex = (activeMenuIndex - 1 + buttons.length) % buttons.length;
            }
        }
        
        buttons[activeMenuIndex].focus();
    } else if (e.key === "Enter") {
        if (activeMenuIndex !== -1) {
            e.preventDefault();
            buttons[activeMenuIndex].click();
        }
    }
}

// Debug Menu Polling & Render
let debugPollInterval = null;

async function pollDebugData() {
    try {
        const res = await fetch("/api/debug/info");
        if (!res.ok) return;
        const data = await res.json();
        
        renderLlmCalls(data.calls);
        renderDebugLogs(data.logs);
        
        // Update red/green pulse dot on the debug tab header
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

function renderLlmCalls(calls) {
    const listEl = document.getElementById("llm-calls-list");
    if (!listEl) return;
    
    if (!calls || calls.length === 0) {
        listEl.innerHTML = '<p class="no-calls-msg">[No active LLM transmissions detected]</p>';
        return;
    }
    
    // Reverse chronological order
    const sorted = [...calls].sort((a, b) => b.id - a.id);
    
    listEl.innerHTML = sorted.map(call => {
        const durationStr = call.duration ? `${(call.duration / 1000).toFixed(2)}s` : "--";
        const statusClass = call.status; // 'active', 'completed', 'failed'
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

// Bind to window to allow inline onclick attribute
window.toggleCallDetails = function(id) {
    const el = document.getElementById(`call-details-${id}`);
    if (el) {
        el.classList.toggle("hidden");
    }
};

function renderDebugLogs(logs) {
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
    
    // Auto scroll debug logs panel to bottom
    listEl.scrollTop = listEl.scrollHeight;
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function startDebugPolling() {
    if (!debugPollInterval) {
        pollDebugData();
        debugPollInterval = setInterval(pollDebugData, 1500);
    }
}

function stopDebugPolling() {
    if (debugPollInterval) {
        clearInterval(debugPollInterval);
        debugPollInterval = null;
    }
}
