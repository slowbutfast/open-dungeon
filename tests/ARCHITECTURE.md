# E2E Test Infra: Retro Text-Adventure Web UI Enhancements

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Prevents default button highlight on startup | ORIGINAL_REQUEST §R1 | 5      | 5      | ✓      |
| 2 | Startup Screen Arrow Key Navigation | ORIGINAL_REQUEST §R1 | 5      | 5      | ✓      |
| 3 | Startup Screen Enter Activation | ORIGINAL_REQUEST §R1 | 5      | 5      | ✓      |
| 4 | Startup Screen Hotkeys (1, 2, T/t) | ORIGINAL_REQUEST §R1 | 5      | 5      | ✓      |
| 5 | Launch Simulation Button Loading State | ORIGINAL_REQUEST §R2 | 5      | 5      | ✓      |
| 6 | Disable Character Page Buttons During Launch | ORIGINAL_REQUEST §R2 | 5      | 5      | ✓      |
| 7 | Atomic State Rendering (No Text Flash) | ORIGINAL_REQUEST §R3 | 5      | 5      | ✓      |

## Test Architecture
- **Test Runner**: Python-based Selenium or Puppeteer (or a custom Node.js/Python headless browser automation script) executing front-end UI actions.
- **Test Case Format**: Assertions on DOM elements (presence of `.active` / `.focused` classes, disabled state, text content, sequence of visibility changes).
- **Directory Layout**:
  - `tests/e2e/` — E2E test scripts and suite runner.
  - `tests/e2e/harness.py` — Web UI automation helper.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Standard Startup and Launch | F1, F4, F5, F6 | Medium |
| 2 | Full Keyboard Navigation Flow | F1, F2, F3, F4 | Medium |
| 3 | Launch and Stream Transition | F5, F6, F7 | High |
| 4 | Multi-modal Action Interactions | F1, F2, F3, F4, F5, F6, F7 | High |
| 5 | Interrupted Launch and Error Recovery | F5, F6 | High |

## Coverage Thresholds
- Tier 1: ≥35 test cases (5 per feature)
- Tier 2: ≥35 test cases (5 per feature)
- Tier 3: ≥7 pairwise combination test cases
- Tier 4: ≥5 real-world application scenarios
