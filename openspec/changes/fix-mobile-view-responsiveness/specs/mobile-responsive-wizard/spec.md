## ADDED Requirements

### Requirement: Mobile wizard screen layout
The startup, preset, character, and custom-preset wizard screens SHALL render as full-height viewport layouts on mobile viewports (max-width: 767px) with scrollable content areas and pinned footer navigation.

#### Scenario: Startup screen fills viewport on mobile
- **WHEN** the viewport width is 767px or less and the startup screen is active
- **THEN** the startup screen container SHALL have `min-height: 100vh` and content SHALL be scrollable without horizontal overflow

#### Scenario: Preset screen fills viewport on mobile
- **WHEN** the viewport width is 767px or less and the preset screen is active
- **THEN** the preset screen container SHALL have `min-height: 100vh` and content SHALL be scrollable without horizontal overflow

#### Scenario: Character screen fills viewport on mobile
- **WHEN** the viewport width is 767px or less and the character screen is active
- **THEN** the character screen container SHALL have `min-height: 100vh` and content SHALL be scrollable without horizontal overflow

#### Scenario: Custom preset screen fills viewport on mobile
- **WHEN** the viewport width is 767px or less and the custom-preset screen is active
- **THEN** the custom-preset screen container SHALL have `min-height: 100vh` and content SHALL be scrollable without horizontal overflow

### Requirement: No horizontal overflow on mobile
All wizard screens SHALL NOT produce horizontal scrollbars at any viewport width from 320px to 767px.

#### Scenario: No horizontal scroll on iPhone SE
- **WHEN** the viewport is 375px wide and any wizard screen is active
- **THEN** `document.documentElement.scrollWidth` SHALL equal `document.documentElement.clientWidth`

#### Scenario: No horizontal scroll on iPhone 16 Pro
- **WHEN** the viewport is 430px wide and any wizard screen is active
- **THEN** `document.documentElement.scrollWidth` SHALL equal `document.documentElement.clientWidth`

### Requirement: Safe-area inset support
Wizard screens SHALL respect safe-area insets on notched devices using CSS `env()` functions.

#### Scenario: Top safe-area padding on notched devices
- **WHEN** the page is viewed on a device with a top safe-area inset (e.g., iPhone 12/13/16 Pro with dynamic island)
- **THEN** wizard screen headers SHALL have `padding-top: env(safe-area-inset-top)` applied

#### Scenario: Bottom safe-area padding on notched devices
- **WHEN** the page is viewed on a device with a bottom safe-area inset (e.g., iPhone 12/13/16 Pro home indicator)
- **THEN** wizard screen footer navigation SHALL have `padding-bottom: env(safe-area-inset-bottom)` applied

### Requirement: Touch target minimum size
All interactive elements (buttons, cards, tabs, inputs) SHALL have a minimum touch target size of 44x44px on mobile viewports.

#### Scenario: Menu buttons meet touch target minimum
- **WHEN** the viewport width is 767px or less
- **THEN** all buttons in the startup screen (`#btn-new-game`, `#btn-restore-game`, `#btn-toggle-crt`) SHALL have `min-height: 44px`

#### Scenario: Preset cards meet touch target minimum
- **WHEN** the viewport width is 767px or less
- **THEN** all preset cards (`.preset-card`) SHALL have `min-height: 44px`

#### Scenario: Character cards meet touch target minimum
- **WHEN** the viewport width is 767px or less
- **THEN** all character cards (`.char-card`) SHALL have `min-height: 44px`

#### Scenario: Form inputs meet touch target minimum
- **WHEN** the viewport width is 767px or less
- **THEN** all form inputs (`input`, `textarea`, `select`) SHALL have `min-height: 44px`

#### Scenario: Mobile tab bar buttons meet touch target minimum
- **WHEN** the viewport width is 767px or less
- **THEN** all mobile tab buttons (`.mobile-tab`) SHALL have `min-height: 44px`

### Requirement: Mobile preset grid layout
The preset selection grid SHALL display as a single-column stacked layout on mobile viewports.

#### Scenario: Preset grid single column on mobile
- **WHEN** the viewport width is 767px or less and the preset screen is active
- **THEN** `.preset-grid` SHALL have `grid-template-columns: 1fr`

#### Scenario: Preset grid two columns on tablet
- **WHEN** the viewport width is between 768px and 1023px and the preset screen is active
- **THEN** `.preset-grid` SHALL have `grid-template-columns: repeat(2, 1fr)`

### Requirement: Mobile character grid layout
The character selection grid SHALL display as a single-column stacked layout on mobile viewports.

#### Scenario: Character grid single column on mobile
- **WHEN** the viewport width is 767px or less and the character screen is active
- **THEN** `.character-grid` SHALL have `grid-template-columns: 1fr`

#### Scenario: Character grid two columns on tablet
- **WHEN** the viewport width is between 768px and 1023px and the character screen is active
- **THEN** `.character-grid` SHALL have `grid-template-columns: repeat(2, 1fr)`

### Requirement: Mobile footer navigation layout
Footer navigation buttons on wizard screens SHALL wrap or stack vertically on mobile viewports to prevent overflow.

#### Scenario: Preset screen footer buttons wrap on mobile
- **WHEN** the viewport width is 767px or less and the preset screen is active
- **THEN** `.panel-footer-nav` SHALL use `flex-wrap: wrap` and buttons SHALL NOT overflow the container

#### Scenario: Character screen footer buttons wrap on mobile
- **WHEN** the viewport width is 767px or less and the character screen is active
- **THEN** `.panel-footer-nav` SHALL use `flex-wrap: wrap` and buttons SHALL NOT overflow the container

### Requirement: Menu button navigation on mobile
All wizard screen buttons SHALL be tappable and navigate correctly on mobile viewports.

#### Scenario: Tap new game button navigates to preset screen
- **WHEN** the user taps `#btn-new-game` on the startup screen at any mobile viewport
- **THEN** the preset screen SHALL become active and the startup screen SHALL become hidden

#### Scenario: Tap restore button navigates to restore screen
- **WHEN** the user taps `#btn-restore-game` on the startup screen at any mobile viewport
- **THEN** the restore screen SHALL become active and the startup screen SHALL become hidden

#### Scenario: Tap preset card selects it
- **WHEN** the user taps a `.preset-card` on the preset screen at any mobile viewport
- **THEN** the tapped card SHALL receive the `active` class and the `#btn-preset-next` button SHALL become visible

#### Scenario: Tap next button navigates to adventure config
- **WHEN** the user taps `#btn-preset-next` on the preset screen at any mobile viewport
- **THEN** the custom-preset screen SHALL become active

#### Scenario: Tap character card selects it
- **WHEN** the user taps a `.char-card` on the character screen at any mobile viewport
- **THEN** the tapped card SHALL receive the `active` class

#### Scenario: Tap launch button navigates to gameplay
- **WHEN** the user taps `#btn-submit-character` on the character screen at any mobile viewport
- **THEN** the gameplay screen SHALL become active

#### Scenario: Tap back button returns to previous screen
- **WHEN** the user taps a `.btn-back` button on any wizard screen at any mobile viewport
- **THEN** the previous screen in the wizard flow SHALL become active

### Requirement: Mobile modal responsiveness
All modals (barter, system prompt, lore, confirmation) SHALL render responsively on mobile viewports with vertical stacking and scrollable content.

#### Scenario: Modal content constrained to viewport on mobile
- **WHEN** the viewport width is 767px or less and any modal is open
- **THEN** `.modal-content` SHALL have `max-width: 90vw` and `max-height: 90vh` with `overflow-y: auto`

#### Scenario: Barter modal stacks vertically on mobile
- **WHEN** the viewport width is 767px or less and the barter modal is open
- **THEN** `.barter-layout` SHALL have `grid-template-columns: 1fr` (vertical stacking)

#### Scenario: Barter arrow hidden on mobile
- **WHEN** the viewport width is 767px or less and the barter modal is open
- **THEN** `.barter-arrow` SHALL have `display: none`

#### Scenario: Modal buttons wrap on mobile
- **WHEN** the viewport width is 767px or less and any modal is open
- **THEN** `.modal-footer` SHALL use `flex-wrap: wrap` and buttons SHALL NOT overflow

### Requirement: Desktop layout preservation
The desktop layout (viewport width >= 1024px) SHALL remain unchanged for grid structures and navigation patterns after mobile responsiveness improvements. Console font standardization is specified in the `game-engine` capability.

#### Scenario: Desktop preset grid unchanged
- **WHEN** the viewport width is 1024px or greater and the preset screen is active
- **THEN** `.preset-grid` SHALL use `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))` (original behavior)

#### Scenario: Desktop character grid unchanged
- **WHEN** the viewport width is 1024px or greater and the character screen is active
- **THEN** `.character-grid` SHALL use `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))` (original behavior)
