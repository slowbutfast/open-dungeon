## ADDED Requirements

### Requirement: Test Save Environment Isolation
The automated test suite SHALL execute process spawns and save file operations strictly within isolated subdirectories under `tests/` and SHALL NOT mutate or delete production game saves in `game/adventures/`.

#### Scenario: Isolated E2E save directory
- **WHEN** Playwright E2E tests are executed
- **THEN** backend process is spawned with `SAVE_DIR` pointing to `tests/adventures_e2e_test`

#### Scenario: Teardown path guard protection
- **WHEN** test teardown hooks perform directory cleanup
- **THEN** system asserts target directory is strictly located inside `tests/` and aborts if path points to `game/adventures`
