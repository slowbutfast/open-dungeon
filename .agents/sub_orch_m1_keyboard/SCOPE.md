# Scope: Keyboard Navigation and Default Highlight Fixes (R1)

## Architecture
- **Web UI Files**:
  - `web/static/app.js`: Main logic for frontend events, keyboard event listeners, and startup screen button actions.
  - `web/static/style.css`: Contains stylesheets, classes for buttons, focus/hover states (e.g. `.btn-focus` or `:focus`).
  - `web/templates/index.html`: Contains HTML templates for startup menu.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Investigate Codebase | Analyze `web/static/app.js`, `web/static/style.css`, and `web/templates/index.html` to find existing button and keyboard event implementation. | None | PLANNED |
| 2 | Implementation | Implement keyboard navigation, wrap-around, enter activation, shortcuts (1, 2, T/t), and default focus prevention. | M1.1 | PLANNED |
| 3 | Review & Validation | Review code changes for security, functionality, and compliance. Run tests. | M1.2 | PLANNED |
| 4 | Forensic Audit | Verify no hardcoding, dummy implementations, or integrity violations. | M1.3 | PLANNED |

## Interface Contracts
- **Startup Menu Buttons**:
  - "Begin New Simulation" (corresponds to keyboard shortcut '1' or selection)
  - "Load Simulation" (corresponds to keyboard shortcut '2' or selection)
  - "Run Diagnostics" (corresponds to keyboard shortcut 'T' or 't' or selection)
- **Key Bindings**:
  - `ArrowUp` / `ArrowDown`: cycle through startup buttons with visual highlight, wrapping around.
  - `Enter`: trigger action on highlighted button.
  - `1`, `2`, `t`/`T`: instantly trigger respective menu action.
