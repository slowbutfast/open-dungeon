## Source material

> "So like the reason why I started to change was because I tested out the front end on my phone and a lot of the UI elements was clipping with the search bar specifically at the bottom of my Safari uh, tab. So I think one of the things we can look at is the margins of the mobile viewport. But can you start a new OpenSpec change? for um, doing some of the front end rewrites and then make sure you write a detailed research.md and then also proposal.md for this change."
>
> — User, 2026-09-23T03:39:16Z

### Raised but not acted on

- **Complete framework rewrite (e.g. React / Svelte / Tailwind)**: The user mentioned "doing some of the front end rewrites". We deliberately keep the zero-build vanilla ES module + vanilla CSS architecture intact (`web/FRONTEND_ARCHITECTURE.md`).
- **Cleaning up `/static/js/vendor/` files**: While Cytoscape and Dagre are unused in the main app, they are used by `playgrounds/map_visualization_playground.html` served at `/playgrounds`. Removing them is outside the scope of this mobile layout fix.
- **iOS virtual keyboard handling**: The original report was about the bottom Safari toolbar, not the virtual keyboard. On iOS Safari, the on-screen keyboard overlays the visual viewport regardless of viewport meta flags.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| `100dvh` (Dynamic Viewport Height) | Viewport height unit that automatically adapts when browser chrome (such as Safari's bottom floating URL/tab bar) expands or collapses. | `100vh` (which is static and based on the largest possible viewport, ignoring UI chrome). |
| `100svh` (Small Viewport Height) | Viewport height representing the screen space available when browser chrome (bars) is fully expanded. | The screen height of a small phone. |
| `env(safe-area-inset-bottom)` | CSS environment variable exposing the pixel inset required to clear hardware notches, home indicator bars, and native system gestures when `viewport-fit=cover` is set. | Standard margin or padding defined by the developer. |
| `--safe-bottom` | CSS custom property defaulting to `env(safe-area-inset-bottom, 0px)` used as an indirection layer to allow simulated insets during automated testing. | A native CSS environment variable. |
| `--tab-bar-h` | CSS custom property defining the canonical height of the mobile tab bar (45px: 44px min-height tab plus 1px border), driving `.mobile-tab { min-height: calc(var(--tab-bar-h) - 1px) }`. | The actual height of the phone's native tab bar. |
| Safari Bottom Floating Tab Bar | The default iOS Safari UI where the URL/search tab bar floats over or docks at the bottom of the viewport. | A website's custom navigation bar. |
| `interactive-widget=resizes-content` | Viewport meta attribute instructing Chromium/Firefox to resize the layout viewport when the virtual on-screen keyboard opens. | A universal fix for iOS Safari (WebKit ignores it). |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| [W3C CSS Values and Units Module Level 4](https://www.w3.org/TR/css-values-4/#viewport-relative-units) | Standardizes `dvh`, `svh`, `lvh` units across modern mobile browsers (WebKit iOS 15.4+, Chromium 108+, Firefox 101+). | W3C Software and Document Notice | 2026-09-23 |
| [WebKit / Safari Viewport & Safe Areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) | Documents `viewport-fit=cover` and `env(safe-area-inset-*)` behavior on iPhone notches, home bars, and dynamic tab bars. | Apple Open Source / Documentation | 2026-09-23 |
| [Chrome Developers: VirtualKeyboard API & `interactive-widget`](https://developer.chrome.com/blog/interactive-widget/) | Documents `interactive-widget=resizes-content` in `<meta name="viewport">` for Chromium 108+ and Firefox (ignored by iOS Safari/WebKit). | CC-BY 4.0 | 2026-09-23 |
| [MDN Web Docs: Dynamic Viewport Units](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_values_and_units) | Provides cross-browser support tables and fallbacks (`100vh` fallback preceding `100dvh`). | CC-BY-SA 2.5 | 2026-09-23 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `dvh` units + `--safe-bottom` / `--tab-bar-h` CSS custom properties | **Adopted** | Provides native dynamic viewport resizing and decoupling for testability via `--safe-bottom` injection. | 2026-09-23 |
| `interactive-widget=resizes-content` in viewport meta | **Adopted** | Harmless to Safari and actively prevents virtual keyboard overlap on Chromium/Android. | 2026-09-23 |
| Dynamic `import()` for Cytoscape / Dagre | **Rejected** | `mapPanel.js` uses a hand-rolled DOM/SVG renderer and does not load vendor graph libraries; the problem does not exist in the main app. | 2026-09-23 |
| JavaScript `window.visualViewport` resize listener | **Rejected** | Janky on scroll, causes layout thrashing, and unnecessary with CSS `100dvh` and CSS custom properties. | 2026-09-23 |
| Framework build step (Vite / Rollup) | **Rejected** | Project architecture explicitly mandates zero build step and native ESM (`web/FRONTEND_ARCHITECTURE.md`). | 2026-09-23 |

## Patterns adopted

- **CSS Token Indirection for Testability & Single Source of Truth**:
  Define custom properties on `:root`:
  ```css
  :root {
      --safe-bottom: env(safe-area-inset-bottom, 0px);
      --tab-bar-h: 45px;
  }
  ```
  Drive `.mobile-tab { min-height: calc(var(--tab-bar-h) - 1px); }` from `--tab-bar-h` so the component and container padding stay strictly synchronized.
- **Dual-Layer Bottom Clearance with 8px Floor**:
  ```css
  .mobile-tab-bar {
      padding-bottom: max(8px, var(--safe-bottom));
  }
  .game-dashboard {
      padding-bottom: calc(var(--tab-bar-h) + max(8px, var(--safe-bottom)));
  }
  ```
- **Max-Wrapped Side Insets**:
  ```css
  padding-left: max(1.5rem, env(safe-area-inset-left, 1.5rem));
  padding-right: max(1.5rem, env(safe-area-inset-right, 1.5rem));
  ```
- **Dynamic Viewport Height Cascade**:
  ```css
  height: 100vh; /* Legacy fallback */
  height: 100dvh; /* Modern mobile dynamic viewport */
  ```
  Applied to `body`, `#startup-screen`, wizard screens, and `.sidebar-panel`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `body` has hardcoded `height: 100vh; width: 100vw; overflow: hidden;` | True | Inspected `web/static/style.css:31-33` | 2026-09-23 | stable |
| `.mobile-tab-bar` has `position: fixed; bottom: 0;` without safe-area inset | True | Inspected `web/static/style.css:1850-1861` | 2026-09-23 | stable |
| Headless Chromium defines `env(safe-area-inset-*)` as `0px` | `0px` | Evaluated `env(safe-area-inset-bottom, 99px)` in browser probe; returned `0px`, confirming the fallback never applies | 2026-09-23 | stable |
| `.mobile-tab-bar` measured height on current code | 45px | Probed in headless Chromium at 390×844 (44px min-height + 1px top border) | 2026-09-23 | stable |
| `.console-input-row` bottom vs tab bar top gap | 148px gap | Probed in headless Chromium at 390×844 (input row bottom at 651px, tab bar top at 799px) | 2026-09-23 | stable |
| `.action-chip` measured height on current code | 29.8px | Probed in headless Chromium (violates $\ge 44\text{px}$ touch target spec) | 2026-09-23 | stable |
| `.app-container` side padding evaluates to 0px on mobile | 0px | `env(safe-area-inset-left, 1.5rem)` evaluates to 0 because `env()` is defined as 0 | 2026-09-23 | stable |
| `mapPanel.js` is a hand-rolled DOM/SVG renderer that never loads `/static/js/vendor/` | True | Inspected `web/static/js/components/mapPanel.js:4-8` and confirmed zero vendor imports | 2026-09-23 | stable |

## Unverified assumptions

| Assumption | Confidence | Cost to verify |
| :--- | :--- | :--- |
| Core hypothesis: `100dvh` plus safe-area inset clearance (`max(8px, var(--safe-bottom))`) prevents clipping under Safari's floating toolbar and home indicator on physical iOS Safari | High | Manual verification on physical iPhone in both Tab Bar (bottom) and Single Tab (top) Safari layouts. |
| Headless WebKit safe-area reporting behavior | Low | Currently unverified (only Chromium is installed in `~/.cache/ms-playwright`). |
| `interactive-widget=resizes-content` has no negative side effects on iOS Safari (ignored without error) | High | Inspect in physical mobile Safari on iOS 16+. |

## Superseded claims

| Prior claim | What corrected it | New stance |
| :--- | :--- | :--- |
| Main app transfers 649 KB of Cytoscape/Dagre vendor bloat on initial page load | `mapPanel.js:4-8` explicitly notes "hand-rolled DOM rooms + an SVG edge layer — no graph library". Grep confirms zero references to `/static/js/vendor/` in the application templates or runtime JS. The vendor files exist solely for `/playgrounds/map_visualization_playground.html`. | Drop asset-loading optimization from this change. The main application is already free of this vendor bloat. |

## Links out

- Architecture documentation: [`web/FRONTEND_ARCHITECTURE.md`](file:///home/node/global-sandbox/projects/open-dungeon/web/FRONTEND_ARCHITECTURE.md)
- Existing mobile viewport tests: [`tests/e2e/test_mobile_viewport.py`](file:///home/node/global-sandbox/projects/open-dungeon/tests/e2e/test_mobile_viewport.py)
- Web templates: [`web/templates/index.html`](file:///home/node/global-sandbox/projects/open-dungeon/web/templates/index.html), [`web/templates/gate.html`](file:///home/node/global-sandbox/projects/open-dungeon/web/templates/gate.html)
- Main CSS stylesheet: [`web/static/style.css`](file:///home/node/global-sandbox/projects/open-dungeon/web/static/style.css)
