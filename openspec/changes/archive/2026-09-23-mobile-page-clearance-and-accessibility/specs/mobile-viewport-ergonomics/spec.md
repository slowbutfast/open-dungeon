## MODIFIED Requirements

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

## ADDED Requirements

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
