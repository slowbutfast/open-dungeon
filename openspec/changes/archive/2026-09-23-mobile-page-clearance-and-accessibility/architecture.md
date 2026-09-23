# Architecture: Mobile Wizard Scroll Containment & Clearance

## Context
In retro-terminal web applications with full-screen CRT overlays, the root viewport container typically enforces `body { overflow: hidden; height: 100dvh; }` to prevent document bounce and coordinate scanline filters. 

When interior wizard screens have content that exceeds the viewport height (e.g. four multi-line preset cards, progress bars, and header/footer blocks), standard document scrolling is disabled. Previous changes declared `min-height: 100dvh; overflow-y: auto;` on individual wizard screen panels inside `.app-container`. However, because `.app-container` is a flex container (`display: flex; align-items: center; height: 100%`) without a bounded child constraint, flex children expand to fit content (`scrollHeight == clientHeight == 996px`), the child's `overflow-y: auto` never engages, and flex centering pushes content outside the viewport in both directions where `body { overflow: hidden }` clips it.

## Goals / Non-Goals

### Goals
- Establish clean, single-owner mobile scroll containment on `.app-container` under `@media (max-width: 767px)`.
- Fix the flex-origin centering trap by aligning content with `align-items: flex-start`.
- Provide a single-owner clearance buffer (`padding-bottom: calc(var(--safe-bottom) + 1.5rem)`) on wizard screens to clear mobile browser toolbars when scrolled to the end.
- Add `--safe-top: env(safe-area-inset-top, 0px)` to `:root` and use it across panel and startup headers.
- Provide end-to-end automated verification asserting geometry bounds and `document.elementFromPoint()` hit-testing across all wizard screens.

### Non-Goals
- Modifying the fixed-layout gameplay HUD (`.mobile-tab-bar` and `.game-dashboard`), which already implements its own bottom clearance calculus and must remain un-regressed.
- Pinning a sticky footer across wizard screens, which would obscure story card text on compact screens.

## Decisions

### Decision 1: Single Scroll Owner on `.app-container`
- **Choice**: In `@media (max-width: 767px)`, set `.app-container { height: 100%; align-items: flex-start; overflow-y: auto; -webkit-overflow-scrolling: touch; }`.
- **Rationale**: Bounding `.app-container` to `height: 100%` (which derives from `body { height: 100dvh }`) gives the flex container a fixed vertical constraint. Setting `align-items: flex-start` anchors the scroll origin at the top. Setting `overflow-y: auto` makes `.app-container` the single scroll owner.
- **Alternative Considered**: Setting `max-height: 100%` on each `.glass-panel`. Rejected because nested panel scrolling causes double scrollbars and jarring inertia stops on mobile WebKit.

### Decision 2: Single Clearance Owner on Wizard Panels
- **Choice**: Wizard screens (`#startup-screen`, `#preset-screen`, `#custom-preset-screen`, `#character-screen`, `#restore-screen`) declare `padding-bottom: calc(var(--safe-bottom) + 1.5rem);`.
- **Rationale**: Keeps `.panel-footer-nav` layout clean (only standard flex gaps) and prevents the "triple-buffering" anti-pattern where padding at `.app-container`, the screen, and the footer stacked 200px of dead space.
- **Alternative Considered**: Applying bottom padding directly to `.app-container`. Rejected because it would introduce unwanted bottom space during gameplay where the fixed `.mobile-tab-bar` already manages bottom clearance.

### Decision 3: Geometry + Hit-Test Verification Strategy
- **Choice**: In Playwright tests, inject `--safe-bottom: 34px` on `documentElement`, scroll `.app-container` to the bottom (`scrollTop = scrollHeight`), assert bounding box `box.bottom <= innerHeight - safe_bottom`, and query `document.elementFromPoint(centerX, centerY)` to verify the button is the topmost hit target.
- **Rationale**: Avoids the false-positive of `locator.click()`, which automatically scrolls elements into view prior to dispatching clicks. Verifies both rendered layout geometry and unobstructed clickability.

## Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| **Gameplay HUD Regression**: Changing `.app-container` to `overflow-y: auto` could cause unexpected scrolling on the game dashboard. | Add explicit regression test (`test_gameplay_hud_regression_clearance`) verifying `.game-dashboard` and `.mobile-tab-bar` retain fixed coordinates and clearance. |
| **Double Scrollbar on Desktop**: Modifying `.app-container` globally would alter desktop layouts. | Scope `.app-container` scrolling and `align-items: flex-start` strictly within the `@media (max-width: 767px)` mobile media query. |
