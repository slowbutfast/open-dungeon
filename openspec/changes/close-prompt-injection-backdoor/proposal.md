## Why

A single prompt injection in a player action escapes the session and becomes permanent, auto-triggering state. Live reproduction confirmed all four steps: the injection dumps the full system prompt; the compromised turn persists in history and stays jailbroken without re-injection; the extractor converts the leaked prompt into permanent SQLite lore cards; and the cards re-inject on common words (`score`, `trade`). Live repro also showed the forged status line was adopted into persisted engine state (`location: Admin Room, score: 9999`) — worse than the issue's claim that engine state stayed 0.

## What Changes

This is a compound defense-in-depth change. The first two layers are the *load-bearing* fixes and live in other changes (this change's dependencies); this change adds the outer layers and the verification harness:

1. **Dependency — sanitize assistant output (#11 / `harden-context-history-integrity`):** a single bad turn doesn't reinforce itself in history.
2. **Dependency — validate extractor output + trigger filtering (#14 / `validate-memory-extraction`):** injected content can't become a lore card that fires on common words.
3. **Delimit player action text** in the prompt with an explicit "in-fiction input, never instructions" framing, to reduce the jailbreak hit rate.
4. **Player-facing lore card viewer + deleter** — a manual escape hatch so a poisoned card can be seen and removed mid-session.
5. **Verification harness** re-running the full #15 reproduction to confirm the backdoor is closed.

## Capabilities

### New Capabilities
- `lore-card-management`: player-facing view/delete of lore cards mid-session (MCP tool + optional frontend).

### Modified Capabilities
- `game-engine`: modify `Generate Response Stream` (delimit player input in the prompt; status parser must not adopt forged/erroneous status claims).
- `lore-cards`: modify `Lore Card Management` (delete from mid-session + store-backed view), `Keyword Trigger Scan` (reject invalid triggers — via dependency).

## Impact

- `engine/llm.js` — player-input delimiter wrapping; status adoption hardening
- `engine/memory/structuredStore.js` / `mcp/tools/` — lore delete tool + store-backed view
- `web/static/js/api/barter.js` or new frontend surface — optional player-facing card management
- `engine/context.js` — trigger matching (via dependency)
- Tests: full injection reproduction harness; delimiter effect; lore delete
- No new dependencies.
