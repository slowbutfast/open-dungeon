## Context

`harden-context-history-integrity` unified the engine commit path on the
canonical three-field status line: `generateResponseStream` parses the last
status line anywhere in the accumulated assistant text through the shared
`parseStatusLine` (`engine/llm.js`), `sanitizeForHistory` strips
status-line-shaped lines and echoed `[CURRENT STATUS]`/`[CURRENT INVENTORY]`
blocks before commit, and `fix-score-progression` made score engine-computed.
The residue: every producing/consuming site outside `llm.js` still carries the
two-field variant or a duplicated copy of the contract string. The parser
tolerates a missing `Moves` (optional group), which is exactly why the drift is
invisible in mock mode. Verified in-repo; no external code.

## System Architecture Diagram

```mermaid
flowchart LR
    subgraph One Definition
        SF[(engine/statusFormat.js\nSTATUS_FORMAT)]
    end
    subgraph Producers
        DEF[DEFAULT_SYSTEM_PROMPT / engine/index.js]
        PRE[4 presets / engine/storyPresets.js]
        MOCK[MockOpenAI / engine/mockOpenAI.js]
        FB[Fallback opening scene / web/routes/game.js]
        WEB[/web/static/js/app.js default prompt*]
    end
    subgraph Consumers
        PARSE[parseStatusLine / engine/llm.js]
        STRIP[renderers.js status strip / web/static]
    end
    subgraph Engine Commit
        CMD[generateResponseStream commit]
    end

    SF -->|interpolate ${STATUS_FORMAT}| DEF
    SF -->|interpolate ${STATUS_FORMAT}| PRE
    SF -->|three-field emit| MOCK
    SF -->|three-field emit| FB
    WEB -->|three-field literal*| STRIP
    DEF --> CMD
    PRE --> CMD
    MOCK --> CMD
    FB --> CMD
    CMD -->|canonical three-field line| PARSE
    STRIP -->|three-field regex, matches canonical line| PARSE

    note["* web/static is zero-build native ESM; it cannot import from engine/. app.js declares the identical literal; agreement is enforced by a source-text test, not a real import."]
```

## Goals / Non-Goals

**Goals:**
- One definition of the status-line format: `STATUS_FORMAT`
  (`engine/statusFormat.js`). Delete it and every producing site reverts to its
  own copy — the obligation concentrates in the constant.
- Every producer (default prompt, 4 presets, mock canned narrations, web
  fallback opening scene) composes the canonical three-field line from that
  definition.
- The frontend status strip (`renderers.js`) matches the canonical three-field
  shape, so the browser can never disagree with what the engine committed.
- The frontend default custom-prompt textarea declares the identical literal,
  pinned by source-text test (the zero-build boundary forbids a real import).
- Preserve the shared parser, the sanitizer, and the forged-status guard
  byte-for-byte.

**Non-Goals:**
- NOT changing `engine/llm.js` `parseStatusLine` / `sanitizeForHistory`
  behavior. The format is locked; we are aligning producers/consumers to it.
- NOT removing the vestigial MCP re-parse (`mcp/tools/gameplay.js:66`). #26's
  "turn returns committed metrics" did not land, so the fallback path stays.
- NOT starting #28 (LLM adapter). `STATUS_FORMAT` is only the prerequisite it
  will consume.
- NOT touching the two-field tolerance in the parser/sanitizer tests
  (`test_shared_status_parser.py` `mock_two_field`, `TestEngineBufferedFragmentCommit`):
  a parser that still tolerates a missing `Moves` is deliberately preserved.

## Decisions

**D1 — `STATUS_FORMAT` lives in a tiny standalone module `engine/statusFormat.js`.**
The constant is exported as the sole definition of the canonical line. Both the
prompts/presets and the tests import one definition. The deletion test holds:
remove the module and `engine/index.js`, `engine/storyPresets.js`, and the
contract tests all break — the definition does not relocate.
*Alternative rejected:* exporting from `engine/llm.js` (that module is the
parser/sanitizer home; the format string is a prompt-contract concern and would
couple the tests to the parser module); inlining the constant in `index.js`
(the presets and the probe tests would then import from the engine module).

**D2 — Prompts interpolate `${STATUS_FORMAT}` into the composed text.**
`DEFAULT_SYSTEM_PROMPT` (already a backtick template literal) replaces the
literal line with `${STATUS_FORMAT}`; each preset `system_prompt` becomes a
backtick template literal ending in `exact format: ${STATUS_FORMAT}`. The final
prompt therefore contains the literal (kept green by `TestPromptContract`,
which now resolves the interpolation the way the modules do), and the source
contains the reference — so a single edit cannot silently drift the contract.

**D3 — Mock and fallback emit the canonical three-field line.**
`engine/mockOpenAI.js:51,57,85` and `web/routes/game.js:349` produce
`[Status: Cantina | Score: 5 | Moves: 0]` / `[Status: Starting Location |
Score: 0 | Moves: 0]`. This removes the mock-mode-only two-field layout that hid
drift while real mode declared three fields.

**D4 — The frontend strip knows `Moves`.**
`web/static/js/ui/renderers.js` match and replace regexes become
`/\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\|\s*Moves:\s*(\d+)\s*\]$/m`
(match) and the `\d+` variant (replace). The browser now strips the same shape
the engine commits.

**D5 — The frontend default prompt keeps the literal, tested for agreement.**
`web/static/js/app.js` cannot `import` from `engine/` (zero-build native ESM).
It declares the identical three-field literal; `TestFrontendConsumersUseCanonicalStatusLine`
pins the agreement by source-text, exactly like the existing presets test.
If the format ever changes, this test fails until the frontend literal is
edited too — no silent drift across the engine/web boundary.

**D6 — The MCP re-parse stays.**
`mcp/tools/gameplay.js:66` is now vestigial (the narration was already
sanitized, so `parseStatusLine` mostly falls back to engine state), but the
"turn returns committed metrics" dependency (#26 follow-up) has NOT landed, so
removing it would leave the tool without a parse path. Left as-is.

## Risks / Trade-offs

- **[D2 prompt text churn]** — converting the four presets from double-quoted
  `\n`-escaped strings to backtick template literals is a larger diff, and the
  `_preset_prompts()` test helper must extract both forms during the transition.
  Mitigated: the composed prompt content is byte-identical to today (same
  examples, same instruction sentence; only the status literal becomes an
  interpolation).
- **[D3 mock change]** — mock canned responses change from two-field to
  three-field. Existing tests that hardcode the two-field mock-style chunks
  (`TestEngineBufferedFragmentCommit.mock_style_chunks`) test the parser's
  tolerance, not the mock source, so they stay green. MCP integration assertions
  (`location == "Cantina"`, engine-owned moves/score) are unchanged by the
  three-field emit because score/moves are engine-computed and the location is
  the same.
- **[D5 boundary]** — the frontend literal can still drift independently of the
  engine constant; the source-text test is the only guard. That is the
  zero-build constraint, not a design choice.
- **[MCP re-parse left as-is]** — a real-mode status line is already stripped by
  `sanitizeForHistory` before the tool reads it, so `parseStatusLine` there is a
  no-op fallback. Keeping it costs nothing and preserves the locked tool
  surface.

## Migration

No data migration. `presets.json` files already written by `savePresets` contain
resolved prompt strings; the code change affects only new writes (and the
source-defined `STORY_PRESETS` defaults), whose composed content is unchanged.

## Open Questions

- Whether the frontend should eventually receive the canonical parser/constant
  via a shared zero-build module (research: "raised but not acted on"). The
  zero-build boundary currently dictates the source-text-agreement approach.
- Whether #26's "turn returns committed metrics" lands soon enough to retire the
  MCP re-parse (`mcp/tools/gameplay.js:66`). Out of scope here; tracked by the
  program.
