## Why

Testing on physical iOS Safari revealed significant UI clipping: fixed and sticky elements (such as the mobile tab bar, console input row, and action chips) clip underneath Safari's bottom floating search/tab bar and hardware home indicator. This occurs because the layout relies on static `100vh` and lacks safe-area inset clearance, while the mobile tab bar's height is decoupled from the content container's padding.

Adopting dynamic viewport units (`100dvh`), establishing CSS custom properties for safe-area insets (`--safe-bottom`, `--tab-bar-h`), and synchronizing layout clearance ensures a robust, zero-clipping experience across mobile phones (specifically iOS Safari), tablets, and desktop PCs.

## What Changes

- **CSS Token Indirection for Bottom Clearance & Testability**:
  - Define `:root` custom properties `--safe-bottom: env(safe-area-inset-bottom, 0px)` and `--tab-bar-h: 45px` to establish a single source of truth.
  - Sizing `.mobile-tab` directly from the token: `min-height: calc(var(--tab-bar-h) - 1px)`.
  - Set `.mobile-tab-bar` bottom padding to `max(8px, var(--safe-bottom))` to clear the home indicator and bottom search bar.
  - Synchronize `.game-dashboard` bottom padding to `calc(var(--tab-bar-h) + max(8px, var(--safe-bottom)))` so narration text, suggestions, and console input remain fully visible above the fixed bar.
- **Dynamic Viewport Heights (`dvh`)**:
  - Update `body` to `height: 100vh; height: 100dvh; width: 100%;` (replacing `width: 100vw;`). Access gate (`gate.html`) automatically inherits this layout.
  - Update wizard screens (`#startup-screen`, `#preset-screen`, `#custom-preset-screen`, `#character-screen`) to `min-height: 100vh; min-height: 100dvh;`.
  - Update mobile `.sidebar-panel` to `max-height: 40vh; max-height: 40dvh;`.
- **Side Padding & Touch Target Fixes**:
  - Fix `.app-container` mobile side padding with `max(1.5rem, env(safe-area-inset-left, 1.5rem))` and `max(1.5rem, env(safe-area-inset-right, 1.5rem))` so side margins do not collapse to 0px.
  - Ensure `.action-chip` and console utility buttons meet the $\ge 44 \times 44\text{px}$ touch target requirement on mobile viewports.
- **Virtual Keyboard Resizing (Chromium/Android)**:
  - Add `interactive-widget=resizes-content` to the `<meta name="viewport">` tag in `web/templates/index.html` and `web/templates/gate.html`. (iOS Safari ignores this attribute; iOS relies on native scroll-into-view behavior).
- **Automated TDD Test Coverage**:
  - Extend `tests/e2e/test_mobile_viewport.py` with an in-game dashboard test fixture.
  - Assert that tab buttons clear the simulated inset zone (`tab_bottom <= inner_height - 34`), that measured bar height minus padding matches `--tab-bar-h`, and that console input and action chips sit above the tab bar.

## Capabilities

### New Capabilities
- `mobile-viewport-ergonomics`: Dynamic viewport scaling (`100dvh`), safe-area inset clearance via CSS token indirection (`--safe-bottom`, `--tab-bar-h`), virtual keyboard resizing configuration, and non-clipping in-game HUD across mobile and desktop viewports.

### Modified Capabilities
*(None. All existing capability requirements remain intact; this capability formalizes mobile layout and viewport ergonomics.)*

## Impact

- **CSS**: `web/static/style.css` (root tokens, dynamic viewport heights, bottom clearance padding on mobile tab bar and dashboard, `.app-container` side margins, `.action-chip` touch targets).
- **HTML Templates**: `web/templates/index.html` and `web/templates/gate.html` (`interactive-widget=resizes-content` in viewport meta).
- **E2E Tests**: `tests/e2e/test_mobile_viewport.py` (new gameplay fixture, `--safe-bottom` injection tests, and touch target assertions).
- **Architecture Documentation**: `web/FRONTEND_ARCHITECTURE.md` (documenting `--safe-bottom`, `--tab-bar-h`, and viewport standards).
- **Engine / Backend**: No backend changes.
