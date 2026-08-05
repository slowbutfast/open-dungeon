// Narrator context block registry (structured-narrator-context).
//
// Single source of truth for the named blocks injected into the narrator's
// system message. Each block declares:
//
//   header   - the bracketed section header, e.g. "CURRENT STATUS"
//   enabled  - (state, turnContext) => boolean; whether the block is injected
//              for this turn (declarative gating, replicating the pre-change
//              conditional appends in `buildSystemMessage`)
//   build    - (state, turnContext) => string; the block body (bullet lines)
//
// `buildSystemMessage` (engine/llm.js) iterates this registry in order to
// compose the prompt, and `sanitizeForHistory` derives its strip-set from the
// headers at module load — so a block added here is both injected AND
// strip-eligible with no second edit anywhere.
//
// The block shape is "header line + following `- ` bullet lines" — the exact
// shape the sanitizer strips when the narrator echoes a block back. A future
// block with a prose body must extend the sanitizer in the same change that
// adds the block (architecture.md, Risks).
import { STYLE_DIRECTIVES } from './narratorStyle.js';

export const CONTEXT_BLOCKS = [
    {
        header: "CURRENT STATUS",
        enabled: () => true,
        build: (state) =>
            `- Location: ${state.location}\n- Score: ${state.score}\n- Moves: ${state.moves}`,
    },
    {
        header: "NARRATOR STYLE",
        // Pinned once the engine captures the adopted style
        // (narrator-style-fidelity, 3.2). Until then (pre-detection, old
        // saves) the block is absent, so a session without a captured style
        // gets no pin.
        enabled: (state) => Boolean(state.narratorStyle),
        build: (state) => {
            const directive = STYLE_DIRECTIVES[state.narratorStyle] || STYLE_DIRECTIVES.direct;
            return `- Adopted style: ${directive}\n- Hold this tone consistently for the entire session; do not drift.`;
        },
    },
    {
        header: "CURRENT INVENTORY",
        // Provided (non-null) inventory keeps the block on; an empty array
        // still renders `- (Empty)` exactly as the pre-change code did. A null
        // inventory (e.g. a caller that never fetched it) gates the block off.
        enabled: (state, { inventoryItems }) => inventoryItems != null,
        build: (state, { inventoryItems }) =>
            inventoryItems && inventoryItems.length > 0
                ? inventoryItems
                    .map(item => `- ${item.item_name} (x${item.quantity}): ${item.description || 'No description'}`)
                    .join('\n')
                : '- (Empty)',
    },
    {
        header: "ADVENTURE SUMMARY",
        enabled: (state) => Boolean(state.summary),
        build: (state) => state.summary,
    },
    {
        header: "WORLD INFO & LORE",
        enabled: (state, { activeCards }) => Boolean(activeCards && activeCards.length > 0),
        build: (state, { activeCards }) =>
            activeCards
                .map((card) => {
                    const name = card.name;
                    const cardType = (card.type || "lore").toUpperCase();
                    const desc = card.description || "";
                    return `- ${name} (${cardType}): ${desc}`;
                })
                .join('\n'),
    },
    {
        header: "RECALLED MEMORIES",
        enabled: (state, { ragMemories }) => Boolean(ragMemories && ragMemories.length > 0),
        build: (state, { ragMemories }) => {
            const intro = "Relevant past events from your adventure:";
            const rows = ragMemories.map(mem => `- (Turn ${mem.turnIndex}, ${mem.eventType}): ${mem.text}`);
            return [intro, ...rows].join('\n');
        },
    },
];
