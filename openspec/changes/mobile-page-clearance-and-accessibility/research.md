# Research: Mobile Wizard Scroll Containment & Page Clearance

## Source Material

### Operator Field Report (2026-09-23)
> "this is what i see on the preset initialization page... bottom controls (Partially Cut Off / Obscured) obscured behind the mobile browser toolbar ([<] [>] | ...ree.vercel.app | tabs icon):
> - Left button: Back
> - Center button: Manage Presets"

### Reviewer Feedback & Empirical Diagnostics (2026-09-23)
> **Agent 1**: "This is a scroll-containment bug, not a safe-area bug... `#preset-screen` has `min-height: 100dvh` and its height is auto, so when four preset cards plus a footer exceed the viewport, the box grows instead of scrolling — `overflow-y: auto` never engages because there's nothing overflowing it. The overflow lands on `.app-container` (`height: 100%`, `overflow: visible`), which passes it to `body { overflow: hidden }`, where it's clipped."
>
> **Agent 2**: "Choose one scroll owner and one clearance owner... `.app-container`: owns mobile scrolling; wizard screens/footer: own the final clearance... use `elementFromPoint` at button center to confirm the button is the topmost hit target."

### Empirical Containment Probe Output ($375 \times 667$ Viewport)
```python
{
  'screenScrollH': 996, 'screenClientH': 996,
  'appScrollH': 833, 'appClientH': 667, 'bodyScrollH': 833, 'bodyClientH': 667,
  'footerBottom': 819.5, 'footerTop': 693.3, 'innerH': 667,
  'appOverflowY': 'visible', 'screenOverflowY': 'auto', 'bodyOverflowY': 'hidden'
}
```

## Glossary

| Term | Meaning | Does NOT Mean |
| :--- | :--- | :--- |
| **Scroll Containment** | A bounded ancestor (`height: 100%`) configured with `overflow-y: auto` that actively consumes content overflow and provides scroll mechanics. | An unbounded element (`min-height: 100dvh`) with `overflow-y: auto` whose height stretches to fit all children. |
| **Flex-Origin Trap** | When a flex container with `align-items: center` houses content taller than itself, centering distributes excess equally off the top and bottom edges, making the top unscrollable. | Natural document flow scrolling. |
| **Hit-Test Verification** | Using `document.elementFromPoint(x, y)` at button coordinates to confirm the button itself is the topmost hit target. | Merely calling `locator.click()`, which silently scrolls elements into view before clicking. |
| **`--safe-bottom`** | CSS token indirection representing hardware bottom safe-area insets or simulated toolbar obstructions. | A substitute for scroll containment. |

## External Research
- **W3C CSS Flexible Box Layout Module Level 1**: Section 8.3 explains alignment along the cross axis. Setting `align-items: center` on a container with overflow causes content to overflow before the start edge (top), which is inaccessible via standard scrollbars unless `align-items: flex-start` or safe alignment is applied.
- **WebKit Bug 216593**: WebKit/iOS Safari expands the visual viewport under dynamic browser chrome. In fixed/non-scrolling containers, floating bars obscure bottom content unless scroll containment is placed on a bounded element with bottom padding buffer.

## Candidate Tech

| Candidate | Status | Reason & Date |
| :--- | :--- | :--- |
| Single Scroller on `.app-container` | **Adopted** (2026-09-23) | Bounded by `height: 100%` of `body (100dvh)`. Prevents unbounded child growth and restores standard mobile scrolling across all wizard views. |
| Multi-Layer Bottom Padding Buffer | **Rejected** (2026-09-23) | Adding buffers to `.app-container`, screen panels, and footers simultaneously creates ~200px of dead space and exacerbates clipping. |
| Sticky Frosted-Glass Wizard Footer | **Deferred** (2026-09-23) | Fixed footer obscures card content on compact 375px screens; natural scroll with end clearance buffer preserves retro CRT aesthetic and reading area. |

## Patterns Adopted
- **Single-Owner Mobile Scroller**: Under `@media (max-width: 767px)`, `.app-container` is the sole scroll owner (`height: 100%; align-items: flex-start; overflow-y: auto; -webkit-overflow-scrolling: touch;`).
- **Single-Owner Clearance Buffer**: Wizard screens declare `padding-bottom: calc(var(--safe-bottom) + 1.5rem);` while `.panel-footer-nav` uses standard layout gap/margins.
- **Top Safe-Area Token Indirection**: Define `--safe-top: env(safe-area-inset-top, 0px)` on `:root` to eliminate raw `env()` calls in header rules.

## Verified Facts

| Claim | Settled By |
| :--- | :--- |
| `#preset-screen` has `screenScrollH == screenClientH == 996px` at $375 \times 667$. | Playwright DOM evaluation probe on live server. |
| `#preset-screen .panel-footer-nav` lands between $y=693\text{px}$ and $y=819\text{px}$, outside the 667px window. | Playwright `getBoundingClientRect()` probe. |
| `.btn-back` is a CSS class, not an ID. | Audit of `web/templates/index.html` (6 occurrences). |
| The character launch button is `#btn-submit-character`, not `#btn-start-game`. | Audit of `web/templates/index.html:141`. |
| Save and restore screen ID is `#restore-screen`, not `#save-modal`. | Audit of `web/templates/index.html:165`. |

## Unverified Assumptions

| Assumption | Cost of Checking |
| :--- | :--- |
| Modals (`#modal-confirm`, `#modal-lore-card`, `#modal-system-prompt`, `#modal-barter`) render within 90dvh on compact handsets. | Open each modal under Playwright at 375×667 and assert `box.bottom <= innerHeight`. |

## Superseded Claims

| Old Claim | Reason It Was Wrong | What Replaced It |
| :--- | :--- | :--- |
| The defect was caused by missing safe-area inset on `.panel-footer-nav`. | The footer was clipped because `#preset-screen` grew unbounded and was centered/clipped by `body { overflow: hidden }`. | Scroll containment and `align-items: flex-start` on `.app-container`. |
| Adding bottom padding across 3 nesting levels provides toolbar clearance. | Stacking padding without a scroller simply expands the clipped offscreen box by ~200px. | Single-owner clearance buffer on the wizard panel. |
