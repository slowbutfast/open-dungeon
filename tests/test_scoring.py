"""
Engine-driven score progression tests (fix-score-progression).

Score is engine-computed (D1): a deterministic rule over extracted milestone
events, applied at extraction-flush time, committed to `state.score`, and
recomputed on undo. The narrator's status-line `Score:` claim is advisory and
never adopted (D2).

1.  `scoreRule(events, priorScore)` — pure rule over typed extractor events
    (`discovery`/`quest`/`combat`/`trade`) with per-type weights, deduplicated
    per distinct milestone (case-insensitive `type:summary` key).
2.  A multi-turn mock session completing milestones ends with
    `dungeon_inspect_state.score > 0`, independent of the mock narrator's
    `Score: 5` status-line wording.
3.  Score round-trips through save/load (persisted value is authoritative).
4.  A 10+ turn mock session does not end with a frozen `score: 0` (regression
    for GH issue #19).
5.  Undo recomputes score so it stays consistent with the rolled-back store.
"""
import json
import os
import subprocess
import sys
import unittest

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Node probe that imports the pure scoring rule and reports its output.
SCORING_PROBE = """
import { MILESTONE_WEIGHTS, scoreRule } from './engine/scoring.js';
const cases = %(cases_json)s;
const out = {};
for (const [key, c] of Object.entries(cases)) {
    out[key] = scoreRule(c.events, c.priorScore ?? 0);
}
out.MILESTONE_WEIGHTS = MILESTONE_WEIGHTS;
console.log(JSON.stringify(out));
"""


def run_scoring_probe(cases):
    """Run the scoring-rule probe in a Node subprocess and return the results."""
    script = SCORING_PROBE % {"cases_json": json.dumps(cases)}
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise AssertionError(
            f"Node scoring probe failed ({proc.returncode}):\n"
            f"stdout: {proc.stdout}\nstderr: {proc.stderr}"
        )
    return json.loads(proc.stdout.strip().splitlines()[-1])


def _json(response):
    result = assert_tool_result(response)
    return json.loads(result["content"][0].get("text", ""))


class TestScoreRule(unittest.TestCase):
    """1.1 — the pure rule accumulates deterministic score over typed events."""

    CASES = {
        # Per-type accumulation with concrete weights.
        "discovery_accumulates": {
            "events": [
                {"type": "discovery", "summary": "Found an iron key."},
                {"type": "discovery", "summary": "Found a rusty iron sword."},
            ],
            "priorScore": 0,
        },
        # Mixed milestone types: quest 10 + combat 5 + trade 3 = 18.
        "mixed_types": {
            "events": [
                {"type": "quest", "summary": "Delivered the datachip."},
                {"type": "combat", "summary": "Defeated the checkpoint guard."},
                {"type": "trade", "summary": "Traded the leaflet for a gem."},
            ],
            "priorScore": 0,
        },
        # Duplicates do not double-count (same type:summary).
        "duplicate_milestones": {
            "events": [
                {"type": "discovery", "summary": "Found an iron key."},
                {"type": "discovery", "summary": "Found an iron key."},
                {"type": "discovery", "summary": "Found an iron key."},
            ],
            "priorScore": 0,
        },
        # priorScore baseline is preserved and added to the increment.
        "prior_baseline": {
            "events": [
                {"type": "discovery", "summary": "Found a blue crystal."},
            ],
            "priorScore": 7,
        },
        # Non-milestone types contribute 0 (movement/dialogue/death/unknown).
        "zero_contributors": {
            "events": [
                {"type": "movement", "summary": "Travelled through the area."},
                {"type": "dialogue", "summary": "Encountered Korr the smuggler."},
                {"type": "death", "summary": "Perished in the dark."},
                {"type": "something_else", "summary": "Unknown event."},
            ],
            "priorScore": 0,
        },
        # Dedup is case-insensitive and trims surrounding whitespace.
        "case_insensitive_dedup": {
            "events": [
                {"type": "discovery", "summary": "  Found the Rusty SWORD. "},
                {"type": "discovery", "summary": "found the rusty sword."},
            ],
            "priorScore": 0,
        },
        # Store rows carry the snake_case `event_type` column; scoreRule must
        # accept those objects too (MemoryManager.computeScore passes rows).
        "store_rows_event_type": {
            "events": [
                {"event_type": "trade", "summary": "Traded the leaflet to Korr."},
                {"event_type": "movement", "summary": "Travelled through the area."},
            ],
            "priorScore": 0,
        },
        # Empty input yields the prior score unchanged.
        "empty_events": {"events": [], "priorScore": 3},
    }

    EXPECTED = {
        "discovery_accumulates": 4,
        "mixed_types": 18,
        "duplicate_milestones": 2,
        "prior_baseline": 9,
        "zero_contributors": 0,
        "case_insensitive_dedup": 2,
        "store_rows_event_type": 3,
        "empty_events": 3,
    }

    def test_score_rule_results(self):
        results = run_scoring_probe(self.CASES)
        for key, expected in self.EXPECTED.items():
            with self.subTest(case=key):
                self.assertEqual(results[key], expected)

    def test_milestone_weights_are_deterministic(self):
        results = run_scoring_probe(self.CASES)
        self.assertEqual(
            results["MILESTONE_WEIGHTS"],
            {"discovery": 2, "quest": 10, "combat": 5, "trade": 3},
        )


@pytest.mark.integration
class TestScoreProgressionMCP(McpTestCase):
    """1.2 — a multi-turn mock session ends with score > 0, engine-computed."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Score Progression Test")

    def test_multi_turn_mock_session_score_advances(self):
        """Discovery milestones accumulate engine-computed score.

        The mock narrator always claims `Score: 5` on the status line; the
        engine must ignore that claim and report the score derived from the
        extracted milestones (2 per distinct discovery), so the final value is
        4 — not the narrator's 5.
        """
        action1 = _json(self.client.send_action("take the iron key"))
        action2 = _json(self.client.send_action("find the rusty sword"))
        state = _json(self.client.call_tool("dungeon_inspect_state"))

        # Engine-computed, not the mock narrator's status-line claim (Score: 5).
        self.assertEqual(action1["score"], 2)
        self.assertEqual(action2["score"], 4)
        self.assertEqual(state["score"], 4)
        self.assertNotEqual(state["score"], 5)

        # send_action agrees with inspect_state.
        self.assertEqual(action2["score"], state["score"])

    def test_send_action_score_agrees_with_inspect_state(self):
        """Every send_action reports the same score inspect_state would."""
        self.client.send_action("take the iron key")
        action = _json(self.client.send_action("look around"))
        state = _json(self.client.call_tool("dungeon_inspect_state"))
        self.assertEqual(action["score"], state["score"])
        self.assertEqual(state["score"], 2)


@pytest.mark.integration
class TestScorePersistenceMCP(McpTestCase):
    """1.3 — score round-trips through save/load."""

    def test_score_round_trips_through_save_load(self):
        init = _json(self.client.init_session(title="Score Round Trip"))
        adventure_id = init["adventure_id"]

        self.client.send_action("take the iron key")
        self.client.send_action("find the rusty sword")

        score_before = _json(self.client.call_tool("dungeon_inspect_state"))["score"]
        self.assertGreater(score_before, 0)

        load = _json(self.client.call_tool("dungeon_load_save", {
            "adventure_id": adventure_id
        }))
        self.assertTrue(load["success"])

        score_after = _json(self.client.call_tool("dungeon_inspect_state"))["score"]
        self.assertEqual(score_after, score_before)


@pytest.mark.integration
class TestScoreNotFrozenMCP(McpTestCase):
    """1.4 — a 10+ turn session does not end with a frozen score: 0 (#19)."""

    def test_score_not_frozen_after_ten_turns(self):
        self.client.init_session(title="Score Not Frozen Test")

        actions = [
            "take the iron key",     # discovery milestone (+2)
            "look around",           # filler
            "find the rusty sword",  # discovery milestone (+2)
            "examine the floor",
            "wait",
            "go north",
            "search the corner",
            "take the iron key",     # duplicate milestone — must NOT re-score
            "stare at the wall",
            "look around",
        ]
        for action in actions:
            _json(self.client.send_action(action))

        state = _json(self.client.call_tool("dungeon_inspect_state"))
        self.assertGreater(state["score"], 0)
        self.assertGreaterEqual(state["moves"], 10)


@pytest.mark.integration
class TestScoreUndoConsistencyMCP(McpTestCase):
    """Undo recomputes score so it stays consistent with the rolled-back store."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Score Undo Test")

    def test_score_recomputed_after_undo(self):
        self.client.send_action("take the iron key")  # score 2
        self.client.send_action("find the rusty sword")  # score 4
        state = _json(self.client.call_tool("dungeon_inspect_state"))
        self.assertEqual(state["score"], 4)

        undo = _json(self.client.call_tool("dungeon_undo_action"))
        self.assertTrue(undo["success"])

        state_after = _json(self.client.call_tool("dungeon_inspect_state"))
        self.assertEqual(state_after["score"], 2)  # sword milestone rolled back
        self.assertEqual(state_after["moves"], 1)


if __name__ == "__main__":
    unittest.main()
