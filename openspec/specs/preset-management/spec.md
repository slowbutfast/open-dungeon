# Preset Management & Setup Flow Specification

## Purpose
Defines the 3-step setup wizard flow, persistent story preset CRUD management, character customization, and error reporting for text adventure universe templates.

## Requirements

### Requirement: 3-Step Setup Wizard Progression
The system SHALL guide users through a strict 3-step wizard setup sequence: `1. Story Preset → 2. Adventure Config → 3. Character Genesis`.

#### Scenario: Navigating preset selection
- **WHEN** user selects a story preset or clicks "Custom Adventure" and clicks "Next: Adventure Config"
- **THEN** the system populates the Adventure Config form with the selected preset details and displays Step 2 without skipping steps.

#### Scenario: Backwards step boundary navigation
- **WHEN** user clicks "Back" on Step 3 (Character Genesis)
- **THEN** the system returns to Step 2 (Adventure Config), preserving all customized input state.

### Requirement: Preset Template CRUD Management
The system SHALL allow users to view, create, edit, and delete universe preset templates persisted in `presets.json` via `/api/presets`.

#### Scenario: Story selection vs. Preset manager actions
- **WHEN** user is on the main Preset Selection screen
- **THEN** cards display only universe template previews without Edit/Delete buttons.
- **WHEN** user opens the Preset Manager screen
- **THEN** cards display retro action buttons (`✏ Edit` and `✕ Delete`) for template modification.

#### Scenario: Create & edit custom preset template
- **WHEN** user inputs preset details and character roster in the Preset Editor and clicks "Save Preset"
- **THEN** the system saves the preset via `/api/presets`, updates `presets.json`, and refreshes the template manager UI.

#### Scenario: Delete preset template
- **WHEN** user clicks "✕ Delete" and confirms the modal warning
- **THEN** the system removes the preset via `/api/presets/:index` and updates `presets.json`.

### Requirement: Character Customization & Roster Management
The system SHALL allow players to customize any selected hero from a preset or define a custom hero.

#### Scenario: Customizing selected preset character
- **WHEN** user selects a preset hero card on Character Genesis and clicks "Customize Hero"
- **THEN** the system pre-populates the custom character form with that hero's name, role/class, description, and triggers for player customization.

### Requirement: Stream Parse Error Logging
The system SHALL capture and log structured errors whenever SSE response stream parsing fails.

#### Scenario: Stream chunk parse failure
- **WHEN** a chunk or line in the response stream fails to parse
- **THEN** the system logs `[STREAM_PARSE_ERROR]` with error details and raw chunk payload to the browser console and alerts the user on critical failures.

