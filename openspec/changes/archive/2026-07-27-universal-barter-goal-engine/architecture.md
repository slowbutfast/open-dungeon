## Context

Traditional text RPGs rely on numeric gold/credits currencies, which are rigid, prompt-heavy, and prone to LLM hallucination. This architecture implements a **Universal Theme-Agnostic Barter & Quest Goal Engine** operating directly on top of the hardened SQLite inventory layer (Issue #7).

## System Architecture Diagram

```mermaid
flowchart TD
    PlayerInput[Player Action: 'trade Silver Ring for Health Potion'] --> BarterParser[Barter & Goal Intent Parser]

    subgraph Deterministic Gating & SQLite Layer
        BarterParser --> ValidateSQL{StructuredStore.hasItem}
        ValidateSQL -->|Missing| RejectionMsg[Return Local Rejection - $0 LLM Cost]
        ValidateSQL -->|Present| SwapTx[BEGIN TRANSACTION: Set requiredItem='traded' + Insert offeredItem]
    end

    subgraph Prompt & LLM Narration Layer
        SwapTx --> SystemEvent[Inject [SYSTEM EVENT: Traded Silver Ring for Health Potion]]
        SystemEvent --> LLMStream[LLM Narration Stream]
        LLMStream --> ClientUI[Render UI: Inventory Grid, Toast, Action Chips]
    end
```

## Evaluated Architectural Options & Decisions

| Option | Architecture | Latency / Token Cost | Model Independence | Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Option A: Currency / Gold System** | Hardcode numeric gold/credits counters in prompt | High prompt overhead, prone to LLM price hallucinations | Poor | **Rejected** |
| **Option B: LLM Function Calling for Trades** | LLM invokes tool `execute_trade({remove, add})` | 2x LLM round-trips (~3-5s), 2x Token Cost | Fails on models lacking tool calling | **Rejected** |
| **Option C: Universal Barter & Prompt Event Injection** | Deterministic SQLite swap ──▶ `[SYSTEM EVENT]` Prompt Injection | Single round-trip (<200ms), 100% deterministic | 100% Model Independent (DeepSeek, Gemini, Llama) | **Selected** ✓ |

### Thought Process & Key Decisions

- **Decision 1: Theme-Agnostic Item Swaps over Currency Mechanics**:
  - *Rationale*: Item swaps (`requiredItem ➔ offeredItem`) work universally across Fantasy (`Silver Ring ➔ Health Potion`), Cyberpunk (`Cyberdeck ➔ Passcode`), or Sci-Fi (`Scrap ➔ Blaster`). Eliminating gold counters prevents LLM hallucinations.
- **Decision 2: Deterministic Pre-Action SQLite Gating ($0 LLM Cost)**:
  - *Rationale*: If a player attempts to trade an unowned item, the engine rejects the transaction locally before calling the LLM API, guaranteeing zero token waste.
- **Decision 3: `[SYSTEM EVENT]` Prompt Injection**:
  - *Rationale*: Once SQLite confirms the trade, inserting `[SYSTEM EVENT: Barter successful! Traded 'Silver Ring' for 'Health Potion'.]` forces the LLM to narrate the exact atmospheric outcome matching the database state.

## Comprehensive Edge Case Matrix

| Edge Case | Failure Mode | Mitigation Strategy |
| :--- | :--- | :--- |
| **1. Unowned Item Trade** | Player tries trading item not in inventory | `StructuredStore.hasItem()` check rejects locally ($0 LLM cost). |
| **2. Multi-Match Ambiguity** | Player holds `Silver Ring` and `Gold Ring` and types `trade ring` | 3-Tiered fuzzy matcher detects ambiguity and prompts player for clarification before LLM invocation. |
| **3. Partial Quantities** | Trading 2 potions from a stack of 3 | SQLite transaction decrements `quantity -= 2` while preserving `status = 'held'`. |
| **4. NPC Goal Handshake** | Player returns quest item to NPC | Quest state machine checks item presence in SQLite, marks goal `COMPLETED`, and grants `rewardItem`. |

## Goals / Non-Goals

**Goals:**
- **Universal Barter Engine**: Implement theme-agnostic item swaps and quest goal state machines.
- **Deterministic Trade Validation**: Intercept `/api/trade` requests and enforce SQLite item ownership.
- **Interactive UI**: Render contextual action chips (`💬 Talk`, `🔄 Barter`) and a side-by-side Barter Modal.

**Non-Goals:**
- Multi-player trading between different online human players (scoped to single-player NPC trading).
