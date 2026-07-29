## ADDED Requirements

### Requirement: Console font size consistency
All console turn types (user, assistant, system) SHALL render at the same font size (0.85rem) across all viewports, inheriting from the base `.console-log` font-size with no per-turn-type `font-size` override.

#### Scenario: Console base font size standardized
- **WHEN** the console log is rendered at any viewport width (mobile, tablet, or desktop)
- **THEN** `.console-log` SHALL have `font-size: 0.85rem`

#### Scenario: User turn inherits base font size
- **WHEN** a user turn (`.log-turn-user`) is rendered in the console
- **THEN** it SHALL inherit `font-size` from `.console-log` (0.85rem) with no explicit `font-size` override

#### Scenario: Assistant turn inherits base font size
- **WHEN** an assistant turn (`.log-turn-assistant`) is rendered in the console
- **THEN** it SHALL inherit `font-size` from `.console-log` (0.85rem) with no explicit `font-size` override

#### Scenario: System turn inherits base font size
- **WHEN** a system turn (`.log-turn-system`) is rendered in the console
- **THEN** it SHALL inherit `font-size` from `.console-log` (0.85rem) with no explicit `font-size` override