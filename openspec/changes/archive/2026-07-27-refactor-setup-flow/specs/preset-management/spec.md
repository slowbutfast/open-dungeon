## ADDED Requirements

### Requirement: Preset Creation
The system SHALL allow users to create a new universe preset template containing a name, adventure title, summary, system prompt, and hero classes, and save it permanently to the filesystem.

#### Scenario: Create new custom preset template
- **WHEN** user inputs preset details and clicks "Save Template"
- **THEN** the system POSTs the preset to `/api/presets`, saves it to the local presets file, and updates the presets list in the UI

### Requirement: Preset Modification
The system SHALL allow users to edit existing universe preset templates.

#### Scenario: Edit preset template
- **WHEN** user updates preset details in the editor and clicks "Save Template"
- **THEN** the system PUTs the updated preset to `/api/presets/:index`, updates the local presets file, and refreshes the presets list in the UI

### Requirement: Preset Deletion
The system SHALL allow users to delete universe preset templates.

#### Scenario: Delete preset template
- **WHEN** user clicks delete and confirms the wipe warning
- **THEN** the system DELETEs the preset via `/api/presets/:index`, updates the local presets file, and refreshes the presets list in the UI
