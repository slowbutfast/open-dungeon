# Explorer 1 Task: Investigate app.js and related files for Keyboard Navigation and Default Highlight Fixes (R1)

## Context
Milestone 1 is implementing keyboard navigation and fixing default highlights in the web UI.

## Objective
Analyze `web/static/app.js`, `web/static/style.css`, and `web/templates/index.html`.
Identify:
1. Where the "Begin New Simulation" button is being focused or highlighted by default on startup.
2. How the startup menu buttons are set up in HTML/JS.
3. How to capture keyboard events for Up/Down arrow keys, Enter, and hotkeys '1', '2', 't'/'T'.
4. How to manage visual highlight/focus class without default focus on startup.

## Output
Write `analysis.md` in this directory with findings and recommended implementation strategy.
Include exact line numbers of target code.
Do NOT write code or modify files. This is investigation-only.
