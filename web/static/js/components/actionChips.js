import { openBarterModal } from './barterModal.js';
import { showToast } from '../ui/toast.js';
import { getState } from '../state.js';
import { fetchGoals } from '../api/barter.js';

let currentNarrationText = '';

export function setCurrentNarration(text) {
  currentNarrationText = text;
  renderActionChips(text);
}

function extractEntities(text) {
  const entities = [];
  const state = window.currentGameState || getState();
  let fullContext = text.toLowerCase();
  if (state && state.history && state.history.length > 0) {
    const recentHistory = state.history.slice(-3).map(h => h.text || '').join(' ').toLowerCase();
    fullContext += ' ' + recentHistory;
  }

  // Look for known NPC/trader names in narration and recent history
  const traderKeywords = ['merchant', 'trader', 'vendor', 'shopkeeper', 'blacksmith', 'alchemist', 'innkeeper',
    'guard', 'wizard', 'priest', 'captain', 'commander', 'pilot', 'fixer', 'dealer', 'broker'];
  for (const keyword of traderKeywords) {
    if (fullContext.includes(keyword)) {
      // Capitalize the first letter for display
      entities.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
    }
  }

  // Scan card names from the game state
  if (state && state.cards) {
    for (const card of state.cards) {
      if ((card.type === 'character' || card.type === 'npc') && card.name) {
        if (fullContext.includes(card.name.toLowerCase())) {
          entities.push(card.name);
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(entities)];
}

function renderActionChips(text) {
  const container = document.getElementById('action-chips');
  const list = document.getElementById('action-chips-list');
  if (!container || !list) return;

  const entities = extractEntities(text);
  if (entities.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  list.innerHTML = '';

  entities.forEach(entity => {
    const talkChip = document.createElement('button');
    talkChip.className = 'action-chip action-chip-talk';
    talkChip.innerHTML = `&#128172; Talk to ${entity}`;
    talkChip.addEventListener('click', () => {
      document.getElementById('console-input').value = `talk to ${entity}`;
      window.submitPlayerCommand();
    });
    list.appendChild(talkChip);

    const barterChip = document.createElement('button');
    barterChip.className = 'action-chip action-chip-barter';
    barterChip.innerHTML = `&#128256; Barter with ${entity}`;
    barterChip.addEventListener('click', () => {
      openBarterModal(entity);
    });
    list.appendChild(barterChip);

    const goalsChip = document.createElement('button');
    goalsChip.className = 'action-chip action-chip-goals';
    goalsChip.innerHTML = `&#128220; Goals from ${entity}`;
    goalsChip.addEventListener('click', async () => {
      try {
        const goals = await fetchGoals();
        if (goals.length === 0) {
          showToast('No active goals.', false);
          return;
        }
        const goalList = goals.map(g => `- ${g.goal_title} (${g.status})`).join('\n');
        showToast(`Active Goals:\n${goalList}`, false);
      } catch (e) {
        // ignore
      }
    });
    list.appendChild(goalsChip);
  });
}

// Also expose a function to manually trigger chips for testing
export function triggerChipsForNarration(text) {
  renderActionChips(text);
}
