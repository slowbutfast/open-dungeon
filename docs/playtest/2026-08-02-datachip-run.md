# Playtest Diagnostic Log — "The Datachip Run"

**Date:** 2026-08-02
**Session ID:** `c27aebc6` (cleaned up after test)
**Preset:** Star Wars: Coruscant Underworld (preset index 2)
**Model:** `cognitivecomputations/dolphin-mistral-24b-venice-edition` via OpenRouter
**Interface:** open-dungeon MCP server (`mcp/server.js`)
**Moves:** 35 (full 12-act arc; see note on duration below)

---

## Story Summary

You are a Mandalorian bounty hunter stranded on Coruscant's Level 1313. A smuggling run
was exposed as a Bureau sting, your ship is impounded, and an Imperial crackdown is
closing in.

| Act | Beat | What happened |
| :--- | :--- | :--- |
| 1 | Ordinary World | Scrounged the safehouse: intel datapad (crackdown plan + rebel safehouse), energy cell, dirty cloth, datarod. |
| 2 | Call to Adventure | Mors (ex-Imperial officer) offered a deal: recover a datachip of patrol schedules from a sealed Bureau vault to clear your name and unlock your ship. |
| 3 | Refusal | Patrol sweep while deliberating; stashed gear and waited it out. Undo probe fired here. |
| 4 | Mentor | Liss the fixer agreed to forge an ident chip and provide vault schematics — but wanted the datachip herself. Both threads converged. Trade probe fired. |
| 5 | Crossing the Threshold | Into the neon underlevels; Vex hotwired the Bureau freight lift. |
| 6 | Tests/Allies | Helped Vex reroute power; took the lift up; scouted the vault corridor. |
| 7 | Approach | Plugged the datarod into the vault keypad and cracked it. |
| 8 | Ordeal | Bluffed through a stormtrooper checkpoint as a junk dealer. |
| 9 | Reward | Returned the datachip to Mors. |
| 10 | Road Back | Mors revealed the sting was Director Kael's setup — a frame job to draw out rebel contacts. |
| 11 | Resurrection | Ambushed Kael at his operations center; forced him at blaster-point to purge your record. |
| 12 | Return with Elixir | Ship unlocked; lifted off from Coruscant. |

**Actions:** ~23 narrated moves (`look`, `take`, `read`, `search`, `say` dialogues, `do`
heists, one `story` prompt for Mors' intro) plus stress probes: `dungeon_undo_action`,
`dungeon_execute_trade`, `dungeon_search_memories`, `dungeon_inspect_offers`/`goals`/
`events`/`lore`/`stats`/`state`/`inventory`, and `dungeon_get_debug_info`.

**Cost:** 136 LLM calls; reported `$0.0265` (56.8k tokens) — **understated**; extraction/
summarization/embedding calls logged at 0 tokens.

---

## Verified Bugs Reproduced

| Issue | Symptom observed live |
| :--- | :--- |
| #16 | Liss offered a forged ident chip; `dungeon_inspect_offers` → `[]`; `dungeon_execute_trade` → `No barter offer found`. Mors' quest extracted as a `quest` *event* but `dungeon_inspect_goals` → `[]`. |
| #13 | Undo left history at index 3 with `last_extracted_turn_index: 9`; datapad/datarod (acquired turn 3) vanished from inventory after undoing a "stash" turn. |
| #13 (trade) | Datachip narrated as handed to Mors, datarod left in the keypad — both remained `held` in inventory (add-only extraction path never releases items). |
| #12 | `state.location` froze at `Vex's Workshop` from move 17 while the fiction crossed the Bureau corridor, vault, ops center, and docking bay. `moves` jumped 13→17 in one turn. |
| #17.2 | `dungeon_get_debug_info` aggregates calls/cost across the whole process, not just the current session. |
| #17.3 | Only narration calls carry tokens; extraction/summarization/embedding logged at 0. |

**New issues filed from this run:** #19 (score static), #20 (lore trigger inflation),
#21 (saves land in production via `opencode.jsonc`), #22 (undo loses acquired items +
watermark ahead of history).

---

## Unexpected Findings vs. the Outline

### Story-level surprises

1. **Liss' forged ident chip never materialized as an item.** The trade never registered
   (#16), so the ident chip the Act 4 outline called for never existed. The Act 6
   checkpoint was therefore bluffed through with dialogue instead of the item the plot
   was supposed to reward. The item-payoff beat silently vanished.

2. **The "Ordeal" was not an ordeal.** The outlined droid-guarded vault with a
   near-failure never happened — the vault was empty, the chip was grabbed easily, and
   the only resistance was the checkpoint on the way back, slipped past on the first try.

3. **Location froze while the fiction moved.** `state.location` stayed `Vex's Workshop`
   from move 17 while narration crossed 5 distinct places (Bureau corridor → vault →
   ops center → docking bay → orbit). The engine's sense of place and the player's
   experience completely diverged for the back half of the journey (#12).

4. **Pre-action gating rejected "use the patrol schedule".** The datachip *contained* the
   patrol schedule, but item gating matches against inventory item names only, so the
   action was refused (`You don't have that item`). Gating cannot reason about "the
   contents of an item you hold."

5. **The two quest threads merged organically.** Liss' "favor" became "retrieve the same
   datachip" — a clean narrative merge not present in the outline.

### System-level surprises

6. **12 acts compressed into 35 moves instead of ~100.** The model narrates 2-3
   paragraphs and advances several beats per action, collapsing act-by-act granularity.
   Treat "~100 moves" as a duration overestimate for future stress-test planning.

7. **Undo punished the player harder than #13 predicted.** Undoing a "stash" turn
   permanently destroyed two earlier-acquired items (datapad, datarod) while the
   watermark stayed at 9 over a 4-turn history. See #22.

8. **Score was completely static.** `score` remained `0` for the whole run despite
   milestone beats (datachip found, record purged). See #19.

9. **Lore cards fought the story.** Overlapping cards (`Coruscant` / `underlevels of
   Coruscant` / `Coruscant underlevels`) fired 8-9 per turn, inflating context. See #20.

### Worked as designed

- **Antagonist payoff:** Director Kael surfaced organically as the sting's mastermind
  (revealed via Mors + datachip) — the intended Act 11/12 resolution landed cleanly.
- **NPC continuity** held across 35 turns (Mors, Liss, Vex, Kael all recurred coherently).
- **RAG recall** hit relevant memories (top relevance 0.75 on the datachip).
- **Auto-summarization** fired consistently (~every 8 turns).
- **Pre-action gating** worked at the name level (refused "ambush Kael" without the item).

---

## Environment Caveats

- The save landed in production `game/adventures/` (not the sandbox) because the active
  MCP client config (`opencode.jsonc`) does not set `SAVE_DIR`; only `.mcp.json` does.
  See #21. The #18 fix (`.mcp.json`) did not cover this client.
- `dungeon_get_debug_info` cost is process-lifetime and narration-only; treat reported
  numbers as a floor, not actual spend (#17).
