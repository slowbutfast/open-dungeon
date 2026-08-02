"""
Tests for the shared status-line parser (M2).

The canonical parser is exported from engine/llm.js and imported by
mcp/tools/gameplay.js. These tests verify:

1. The shared parser tolerates an uppercase `[STATUS: ...]` line with trailing
   content after it (the engine commits the values from that line).
2. The shared parser tolerates the mock LLM's two-field line
   `[Status: ... | Score: N]` (no Moves) without crashing.
3. mcp/tools/gameplay.js imports the shared parser instead of defining its own
   case-sensitive status regex.
"""
import json
import os
import subprocess
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMEPLAY_SOURCE_PATH = os.path.join(REPO_ROOT, "mcp", "tools", "gameplay.js")

# Inputs the parser must handle. Expected location/score/moves are the values
# the engine commits when it parses that status line.
PARSER_CASES = {
    # Uppercase STATUS with trailing content after the status line.
    "uppercase_trailing": (
        "You step into the tavern.\n"
        "[STATUS: Ashfall Market | Score: 3 | Moves: 7]\n"
        "The barman nods at you."
    ),
    # Standard lowercase Status with a Moves field.
    "standard_with_moves": "You walk south.\n[Status: Cantina | Score: 5 | Moves: 2]",
    # Mock LLM two-field line (no Moves).
    "mock_two_field": "You walk south into the noisy cantina.\n[Status: Cantina | Score: 5]",
    # No status line at all.
    "no_status": "Just some narration without a status line.",
}

EXPECTED_RESULTS = {
    "uppercase_trailing": {"location": "Ashfall Market", "score": 3, "moves": 7},
    "standard_with_moves": {"location": "Cantina", "score": 5, "moves": 2},
    "mock_two_field": {"location": "Cantina", "score": 5, "moves": None},
    "no_status": {"location": None, "score": None, "moves": None},
}

# JS probe that imports the shared parser and reports its output for each case.
PARSER_PROBE = """
import { parseStatusLine } from './engine/llm.js';
const cases = %(cases_json)s;
const out = {};
for (const [key, input] of Object.entries(cases)) {
    const r = parseStatusLine(input);
    out[key] = {
        narration: r.narration,
        location: r.location,
        score: r.score,
        moves: r.moves
    };
}
console.log(JSON.stringify(out));
"""


def run_parser_probe():
    """Run the parser probe in a Node subprocess and return the parsed results."""
    script = PARSER_PROBE % {"cases_json": json.dumps(PARSER_CASES)}
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise AssertionError(
            f"Node parser probe failed ({proc.returncode}):\n"
            f"stdout: {proc.stdout}\nstderr: {proc.stderr}"
        )
    return json.loads(proc.stdout.strip().splitlines()[-1])


class TestSharedStatusParser(unittest.TestCase):
    """The shared parser (engine/llm.js) returns the values the engine commits."""

    def test_parser_reports_committed_state_for_uppercase_and_trailing_content(self):
        results = run_parser_probe()
        for case_key, expected in EXPECTED_RESULTS.items():
            with self.subTest(case=case_key):
                got = results[case_key]
                self.assertEqual(got["location"], expected["location"])
                self.assertEqual(got["score"], expected["score"])
                self.assertEqual(got["moves"], expected["moves"])

    def test_parser_strips_uppercase_status_line_from_narration(self):
        results = run_parser_probe()
        narration = results["uppercase_trailing"]["narration"]
        self.assertIn("You step into the tavern.", narration)
        self.assertIn("The barman nods at you.", narration)
        self.assertNotIn("[STATUS:", narration)
        self.assertNotIn("Ashfall Market", narration)

    def test_parser_returns_narration_unchanged_when_no_status_line(self):
        results = run_parser_probe()
        self.assertEqual(
            results["no_status"]["narration"],
            PARSER_CASES["no_status"],
        )


class TestGameplayImportsSharedParser(unittest.TestCase):
    """mcp/tools/gameplay.js must import the shared parser, not reimplement it."""

    @classmethod
    def setUpClass(cls):
        with open(GAMEPLAY_SOURCE_PATH, encoding="utf-8") as f:
            cls.source = f.read()

    def test_gameplay_imports_parse_status_line_from_engine(self):
        self.assertRegex(
            self.source,
            r"import\s*\{[^}]*parseStatusLine[^}]*\}\s*from\s*['\"][^'\"]*"
            r"engine/llm\.js['\"]",
        )

    def test_gameplay_does_not_define_local_parser_or_regex(self):
        self.assertNotIn("statusLineRegex", self.source)
        self.assertNotRegex(self.source, r"function\s+parseStatusLine\s*\(")


if __name__ == "__main__":
    unittest.main()
