# mobile-viewport-ergonomics Specification

## Purpose
Specifies dynamic viewport scaling (`100dvh`), safe-area inset clearance via CSS token indirection (`--safe-bottom`, `--safe-top`, `--safe-left`, `--safe-right`, `--tab-bar-h`), virtual keyboard resizing configuration, and non-clipping in-game HUD across mobile and desktop viewports.

## Requirements

### Requirement: Dynamic Viewport Height Sizing
The web application SHALL size the root viewport container, wizard screens, and mobile sidebar panels using dynamic viewport units so that layout height automatically conforms to expandable and collapsible browser chrome without clipping content or creating detached gaps.

#### Scenario: Dynamic browser chrome adjustment on mobile
- **WHEN** the application is loaded on a mobile browser where navigation bars expand or collapse
- **THEN** the root container (`body`) and wizard screens evaluate height against the dynamic viewport (`100dvh`), preventing content clipping under the toolbar without creating detached empty gaps

#### Scenario: Mobile sidebar panel height constraint
- **WHEN** a player switches to a sidebar panel (LORE, MEMORY, DEBUG, MAP) on a viewport narrower than 768px
- **THEN** `.sidebar-panel` constrains its maximum height to `40dvh` so it does not crowd out the entire viewport

---

### Requirement: Bottom Safe-Area Inset Clearance and Token Indirection
The application SHALL mediate bottom safe-area insets through CSS custom properties (`--safe-bottom` and `--tab-bar-h`), keeping tab controls, interactive dashboard content, wizard screens, and modal dialogs elevated above the safe-area inset with at least an 8px clearance floor for navigation bars and a single-owner clearance buffer for scrollable views.

#### Scenario: Notched mobile device clearance (e.g. 34px inset)
- **WHEN** the application renders on a device with a non-zero bottom safe-area inset (e.g., iPhone home indicator or bottom Safari search bar)
- **THEN** mobile tab buttons sit at least `max(8px, inset)` (e.g., 34px) above the bottom edge of the viewport, holding controls clear of the gesture area and browser bar

#### Scenario: Non-notched mobile device (0px inset)
- **WHEN** the application renders on a device reporting an inset of 0px
- **THEN** mobile tab buttons retain at least an 8px clearance floor above the bottom edge of the viewport

#### Scenario: Console input and action chips clearance
- **WHEN** the core gameplay HUD is active on a mobile viewport (<768px)
- **THEN** the console input row and suggestion action chips remain positioned above the mobile navigation bar with no visual overlap

#### Scenario: Wizard screens scrollable bottom buffer
- **WHEN** any pre-game wizard screen (`#startup-screen`, `#preset-screen`, `#custom-preset-screen`, `#character-screen`, `#restore-screen`) is rendered on a mobile viewport (<768px)
- **THEN** the screen content retains a bottom clearance buffer of `calc(var(--safe-bottom) + 1.5rem)` so that all footer navigation buttons sit clear of floating browser chrome when scrolled to the end

#### Scenario: Modal dialog bottom clearance
- **WHEN** a modal dialog (`.modal-content`) is opened on a mobile viewport
- **THEN** it constrains height to `90dvh`, scrolls internal overflow, and provides `calc(var(--safe-bottom) + 1rem)` bottom clearance padding

---

### Requirement: Universal Mobile Wizard and Modal Accessibility
All pre-game wizard screens and modal dialogs SHALL provide bounded scroll containment on `.app-container` and guarantee that all primary navigation buttons remain unobstructed and hit-testable when scrolled to the bottom under simulated bottom insets.

#### Scenario: Preset screen footer buttons hit-testing
- **WHEN** a player views `#preset-screen` on a mobile viewport with an active bottom inset of 34px and scrolls `.app-container` to the bottom
- **THEN** `#preset-screen .btn-back` and `#btn-manage-presets` bounding box bottoms SHALL be less than or equal to `window.innerHeight - 34px + 0.5px`
- **AND** `document.elementFromPoint()` at the center of each button SHALL evaluate to the button element, confirming it is not clipped or obscured by overlapping chrome

#### Scenario: Custom preset and character genesis navigation clearance
- **WHEN** a player navigates to `#custom-preset-screen` or `#character-screen` on a mobile viewport with an active bottom inset of 34px and scrolls to the bottom
- **THEN** `#btn-submit-custom-preset` and `#btn-submit-character` bounding box bottoms SHALL be less than or equal to `window.innerHeight - 34px + 0.5px`

#### Scenario: Restore screen back button clearance
- **WHEN** a player views `#restore-screen` on a mobile viewport with an active bottom inset of 34px and scrolls to the bottom
- **THEN** `#restore-screen .btn-back` bounding box bottom SHALL be less than or equal to `window.innerHeight - 34px + 0.5px`

---

### Requirement: Zero Horizontal Overflow and Side Margin Preservation
The application SHALL constrain all screens and interactive panels so that no horizontal scrolling occurs and side margins are preserved on mobile viewports ranging from 375px to 768px.

#### Scenario: Compact mobile viewport (375px)
- **WHEN** any screen (startup, presets, characters, custom preset, save/load, or gameplay HUD) is rendered at 375px width (e.g., iPhone SE)
- **THEN** `document.documentElement.scrollWidth` strictly equals `window.innerWidth`, with zero horizontal overflow

#### Scenario: Standard mobile and tablet viewports (390px - 768px)
- **WHEN** any screen is rendered at 390px (iPhone 12/13/14), 430px (iPhone 16 Pro), or 768px (iPad Mini)
- **THEN** `document.documentElement.scrollWidth` strictly equals `window.innerWidth`

#### Scenario: Mobile side margin preservation
- **WHEN** screens are displayed on a mobile viewport
- **THEN** `.app-container` retains at least 1.5rem side padding, even when the platform defines `env(safe-area-inset-left)` as 0px

---

### Requirement: Minimum Touch Target Accessibility
All primary interactive elements on mobile viewports SHALL provide a minimum clickable/tappable bounding box of 44×44 CSS pixels.

#### Scenario: Mobile navigation tabs
- **WHEN** rendered on a mobile viewport (<768px)
- **THEN** every tab button within `#mobile-tab-bar` measures at least 44px in height and width

#### Scenario: Wizard buttons, cards, and inputs
- **WHEN** rendered on a mobile viewport
- **THEN** all preset cards, character cards, navigation buttons, and form inputs maintain a minimum height of 44px

#### Scenario: Action chips and input controls
- **WHEN** action chips (`.action-chip`) or console send/undo buttons are rendered on mobile
- **THEN** their bounding boxes measure at least 44px in interactive height

---

### Requirement: Mobile Access Gate Alignment
The serverless access gate (`gate.html`) SHALL conform to the dynamic viewport height without clipping content or action buttons.

#### Scenario: Access gate on small mobile screen
- **WHEN** an unauthenticated visitor navigates to `/` on a mobile device
- **THEN** the CRT gate panel and "[ Sign in with Vercel ]" button fit within the viewport height without clipping against the bottom or top safe areas, maintaining zero horizontal overflow

---

### Requirement: Virtual Keyboard Viewport Resizing (Chromium / Android)
The HTML templates SHALL configure viewport metadata with `interactive-widget=resizes-content` so that modern Chromium-based mobile browsers resize the layout viewport when the virtual on-screen keyboard appears.

#### Scenario: Virtual keyboard activation on Chromium
- **WHEN** a user focuses `#console-input` on a Chromium mobile browser with an on-screen keyboard
- **THEN** the browser resizes the layout viewport above the keyboard, keeping the prompt and active content in view without obscuring the fixed interface
