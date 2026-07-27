**GitHub Issue**: [#8 (Implement Universal Theme-Agnostic Barter & Quest Goal Engine)](https://github.com/slowbutfast/open-dungeon/issues/8)

## Why

Hardcoding specific currencies (like gold or credits) restricts text adventures to narrow themes and leads to LLM hallucinations around pricing or money. Building a universal, theme-agnostic Barter & Quest Goal Engine on top of our hardened SQLite inventory layer (Issue #7) enables direct item-for-item swaps (`Silver Ring ➔ Health Potion` in Fantasy, `Stolen Cyberdeck ➔ Passcode` in Cyberpunk) and deterministic NPC goal handshakes across any setting with zero LLM API cost for unowned items.

## What Changes

- **Universal Barter Offers (Item Swaps)**: Traders define item swap offers (`{ requiredItem, offeredItem }`). The engine validates ownership via SQLite `hasItem()` and executes atomic item swaps in SQLite before streaming LLM narration.
- **NPC Goal Handshake & Objective State Machine**: Tracks quest goals (`{ goalTitle, requiredItem | requiredLocation, rewardItem, status }`) and grants rewards deterministically upon objective completion.
- **Deterministic Prompt Event Injection**: Injects `[SYSTEM EVENT: Barter successful! Traded 'Silver Ring' for 'Health Potion'.]` into system prompts to guarantee atmospheric DM narration matching the transaction.
- **Interactive Action Chips & Retro Barter UI Modal**: Parses entities from DM output to render interactive action chips (`💬 Talk`, `🔄 Barter`, `📜 Goals`) and a side-by-side Barter Modal for one-click trading.

## Capabilities

### New Capabilities
- `barter-system`: Defines universal barter offers, atomic item swaps, NPC goal state machines, and interactive barter UI modals.

### Modified Capabilities
- `game-engine`: Updated to handle deterministic barter trade endpoints, prompt event injections, and quest goal completion events.

## Impact

- `engine/memory/barterEngine.js`: New barter contract manager and quest goal state machine.
- `engine/llm.js` & `engine/index.js`: Trade action routing and `[SYSTEM EVENT]` prompt injection.
- `web/routes/game.js`: New POST `/api/trade` and `/api/goals` API endpoints.
- `web/static/js/components/barterModal.js`: Client-side Barter Modal UI and action chip handlers.
