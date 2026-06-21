# Event extraction JSON parsing fails when output is truncated mid-string

## Description

When the LLM generates event extraction responses (lore_facts, events, inventory_changes), the output is sometimes truncated mid-string by the `max_tokens` limit. The `parseExtractedJson()` method in `engine/memory/eventExtractor.js` only handles truncated closing brackets (`]`, `}`), but not mid-string truncation.

## Example failing output

```json
{
  "lore_facts": [
    {
      "name": "rusted catwalk",
      "type": "location",
      "description": "A rusted catwalk that
    }
  ]
}
```

The description value is cut off mid-string (missing closing `"`), which makes the JSON unparseable even after the `]` salvage logic runs.

## Impact

- Lore facts silently fail to be extracted from gameplay
- Memory features (RAG, inventory tracking, event log) don't populate
- `console.error` log shows "Failed to parse extracted events JSON" but game continues

## Current workarounds attempted (insufficient)

- Increased `max_tokens` from 1024 → 2048 (still truncates for long narratives)
- Salvage logic appends `]`, `}]`, `]}` etc. (doesn't handle mid-string truncation)

## Suggested fix

Options ranked by effort:

1. **Increase `max_tokens` further** — e.g. 4096 — cheapest fix but still fragile
2. **Use a partial/lenient JSON parser** like `jsonrepair` or `@as-integrations/json-parse` npm package that can auto-heal truncated strings
3. **Trim the output** before parsing — detect and strip the last incomplete key-value pair
4. **Stream the extraction** — give the LLM more budget and request line-delimited output instead of bulk JSON
5. **Shorten the extraction prompt** — request shorter summaries to stay within token budget

## Environment

- OpenRouter backend (`deepseek/deepseek-v4-flash`)
- `max_tokens: 2048` for extraction calls
- Happens with longer gameplay sessions where many lore facts accumulate in a single batch
