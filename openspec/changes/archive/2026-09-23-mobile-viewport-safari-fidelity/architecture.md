## Context

The Open Dungeon web frontend is a zero-build vanilla ES-module Single Page Application (`web/static/js/`, `web/static/style.css`, `web/templates/index.html`). Testing on physical iOS Safari revealed that interactive elements in the mobile gameplay HUD (console command row, suggestion chips, and mobile navigation tabs) clip underneath Safari's bottom floating search/tab bar and the hardware home indicator.

### Current Code State & Pain Points:
1. **`web/static/style.css:31-33`**: `body { height: 100vh; width: 100vw; overflow: hidden; }` uses static `100vh`, which evaluates to the maximum screen height, pushing the lower ~44–70px of content beneath Safari's floating chrome. `width: 100vw` also includes desktop scrollbar widths.
2. **`web/static/style.css:1850-1861`**: `.mobile-tab-bar` is fixed at `bottom: 0` without `padding-bottom: env(safe-area-inset-bottom)`, placing buttons directly under the iPhone home indicator and Safari search bar.
3. **`web/static/style.css:1843`**: `.game-dashboard` uses a hardcoded `padding-bottom: 56px`, which does not match the actual 45px tab bar height and is disconnected from safe-area insets.
4. **`web/static/style.css:1888`**: `.sidebar-panel` uses a static `max-height: 40vh;`.
5. **`web/static/style.css:1952-1958`**: `#startup-screen`, `#preset-screen`, `#custom-preset-screen`, and `#character-screen` use static `min-height: 100vh`.
6. **`web/static/style.css:1974`**: `.app-container` uses `padding-left: env(safe-area-inset-left, 1.5rem)`. Because modern browsers define `env()` as `0px`, the `1.5rem` fallback is ignored, collapsing side padding to 0px.
7. **Action Chips**: `.action-chip` renders at ~29.8px height, violating the mobile touch target minimum ($\ge 44\text{px}$).
8. **`web/templates/index.html:5` & `web/templates/gate.html:5`**: Viewport meta tag has `viewport-fit=cover` but lacks `interactive-widget=resizes-content`. `gate.html` loads `style.css` and will automatically inherit the `body` dynamic height fix.

## System Architecture Diagram

```mermaid
flowchart TD
    subgraph Tokens[CSS Custom Properties on :root]
        SB["--safe-bottom: env(safe-area-inset-bottom, 0px)"]
        TB["--tab-bar-h: 45px"]
    end

    subgraph Viewport[Dynamic Viewport Height Cascade]
        Body["body { height: 100vh; height: 100dvh; width: 100%; }"]
        Screens["#startup-screen, #preset-screen, #character-screen { min-height: 100vh; min-height: 100dvh; }"]
        Sidebar[".sidebar-panel { max-height: 40vh; max-height: 40dvh; }"]
        Gate["gate.html inherits body 100dvh automatically"]
    end

    subgraph MobileLayout[Mobile HUD Geometry (< 768px)]
        TabBtn[".mobile-tab { min-height: calc(var(--tab-bar-h) - 1px); }"]
        TabBar[".mobile-tab-bar { padding-bottom: max(8px, var(--safe-bottom)); }"]
        Dashboard[".game-dashboard { padding-bottom: calc(var(--tab-bar-h) + max(8px, var(--safe-bottom))); }"]
        SidePadding[".app-container { padding-left/right: max(1.5rem, env(...)); }"]
        ActionChips[".action-chip, .btn-utility { min-height: 44px; }"]
    end

    subgraph Testing[Playwright Test Harness]
        Injection["page.evaluate: setProperty('--safe-bottom', '34px')"]
        Assert["Assert: tab_bottom <= inner_height - 34"]
    end

    Tokens --> TabBtn
    Tokens --> TabBar
    Tokens --> Dashboard
    TabBar -.->|"renders above"| Dashboard
    Injection --> Tokens
    Injection --> Assert
```

## Goals / Non-Goals

**Goals:**
- **Zero Bottom Clipping**: Ensure mobile tab buttons, console input, suggestion chips, and wizard controls clear Safari's bottom toolbar and the hardware home indicator across all device sizes.
- **Testable Geometry**: Provide a CSS token indirection mechanism (`--safe-bottom`, `--tab-bar-h`) enabling automated red-then-green tests in headless Playwright.
- **Component & Padding Synchronization**: Drive `.mobile-tab` height from `--tab-bar-h` (45px) so the bar's measured height and container padding remain strictly in sync.
- **Dynamic Viewport Sizing**: Transition layout heights from static `vh` to dynamic `dvh` with clean fallbacks.
- **Touch Targets & Margins**: Ensure `.action-chip` and console utility buttons reach $\ge 44\text{px}$ min-height and `.app-container` retains $\ge 1.5\text{rem}$ side padding.

**Non-Goals:**
- **Framework Rewrite**: Keep vanilla ESM and pure CSS.
- **Vendor Script Deletion**: `web/static/js/vendor/` remains for the standalone map visualization playground.
- **iOS Virtual Keyboard Override**: iOS WebKit ignores `interactive-widget=resizes-content`; iOS relies on native scroll-into-view behavior.
- **JS-Driven Layout Observers**: No `ResizeObserver` or `visualViewport` JS scroll listeners.

## Decisions

### 1. Token Indirection (`--safe-bottom` and `--tab-bar-h`)
- **Choice**:
  ```css
  :root {
      --safe-bottom: env(safe-area-inset-bottom, 0px);
      --tab-bar-h: 45px;
  }
  .mobile-tab {
      min-height: calc(var(--tab-bar-h) - 1px);
  }
  ```
- **Rationale**:
  - Headless Chromium evaluates `env(safe-area-inset-bottom)` as `0px`.
  - Setting `--safe-bottom: 34px` in automated tests lets Playwright assert that tab buttons stay above the simulated inset zone (`tab_bottom <= inner_height - 34`), which fails on current code (844 > 810) and passes after the fix.
  - Sizing `.mobile-tab` from `--tab-bar-h - 1px` (accounting for the 1px top border) guarantees the tab bar height precisely matches the token.
- **Alternatives Considered**:
  - *Hardcoding `env(safe-area-inset-bottom)` directly*: Untestable in headless Playwright.
  - *Using `--tab-bar-h: 56px`*: Mismatches the actual 45px rendered tab bar, creating 11px of ghost gap.

### 2. Viewport Height Strategy: `100dvh` Cascade
- **Choice**:
  ```css
  height: 100vh;
  height: 100dvh;
  ```
- **Rationale**:
  - `dvh` recalculates dynamically as mobile browser chrome expands or contracts.
  - `gate.html` and `index.html` both load `style.css`, so updating `body` automatically applies to both pages.
  - `#startup-screen` and other wizard screens are updated to `min-height: 100dvh`.

### 3. Max-Wrapped Side Insets
- **Choice**:
  ```css
  padding-left: max(1.5rem, env(safe-area-inset-left, 1.5rem));
  padding-right: max(1.5rem, env(safe-area-inset-right, 1.5rem));
  ```
- **Rationale**: When `env()` is 0, the fallback was previously ignored by browsers because the variable is defined; `max()` ensures a strict 1.5rem floor while expanding on landscape devices with notches.

### 4. Virtual Keyboard Handling: `interactive-widget=resizes-content`
- **Choice**: Add `interactive-widget=resizes-content` to `<meta name="viewport">` in `index.html` and `gate.html`.
- **Rationale**: In Chromium 108+ and Firefox for Android, this instructs the browser to resize the layout viewport when the keyboard opens. On iOS Safari, it is harmlessly ignored.

## Risks / Trade-offs

- **[Risk] Viewport jumpiness during scroll on mobile**:
  - *Mitigation*: The root `body` has `overflow: hidden`. The page itself does not scroll; only internal panels (`.console-log`, `.sidebar-panel`) scroll. Since the outer container remains fixed, `dvh` updates are limited to user-initiated browser bar events.
- **[Risk] Automated tests vs real device behavior**:
  - *Mitigation*: Automated tests verify the layout algebra via `--safe-bottom: 34px`. Manual device verification on physical hardware (iPhone in both Safari Tab Bar and Single Tab layouts) is formalized in the test verification plan.

## Migration & Rollback

- **Deploy**: Pure static CSS and template HTML change. No backend endpoints or database state are altered.
- **Rollback**: Clean single git revert if unexpected layout regressions appear on any platform.
