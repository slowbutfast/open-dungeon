# Console font sizes are inconsistent across turn types

## Description

The three console turn types (`log-turn-user`, `log-turn-assistant`, `log-turn-system`) each render at different font sizes, creating a visually uneven reading experience. Additionally, the base console font size is too large relative to the overall layout.

## Current sizes (desktop)

| Turn type | Font size | Notes |
|-----------|-----------|-------|
| `.console-log` (base) | `0.95rem` | Base — inherited by `.log-turn-user` |
| `.log-turn-user` | `0.95rem` | Inherits from `.console-log` |
| `.log-turn-assistant` | `1.05rem` | Explicitly set — **bigger** than user |
| `.log-turn-system` | `0.85rem` | Explicitly set — **smaller** than user |

The assistant response is rendered 10% larger than the user's prompt, and system messages are 10% smaller. There is no semantic reason for this difference — all three are console log entries and should share a consistent base size.

On mobile (`<= 767px`), `.console-log` was recently reduced to `0.85rem`, but `.log-turn-assistant` and `.log-turn-system` still use their explicit overrides, so the inconsistency persists.

## Suggested fixes

1. Remove the explicit `font-size` overrides on `.log-turn-assistant` and `.log-turn-system` so they inherit from `.console-log`
2. Reduce the base `.console-log` size from `0.95rem` to `0.85rem` (desktop) to match the mobile value
3. Use subtle color/weight differentiation instead of font size to distinguish turn types

## Files affected

- `web/static/style.css` — `.console-log` (line ~522), `.log-turn-assistant` (line ~547), `.log-turn-system` (line ~555)

## Acceptance criteria

- `.log-turn-user`, `.log-turn-assistant`, and `.log-turn-system` all render at the same font size
- The base console size is `0.85rem` on both desktop and mobile
- Turn types remain visually distinguishable by color and style (not font size)