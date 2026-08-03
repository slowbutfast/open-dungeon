"""
Engine-level status parsing + history sanitization tests (harden-context-history-integrity).

The MCP half of the shared-parser unification is already landed
(tests/test_shared_status_parser.py probes the exported parser). This file
locks down the engine's own commit path:

1.  The engine commits location from the LAST status line anywhere in a
    streamed response (trailing content tolerated). `score` is NO LONGER
    adopted from the status line — it is engine-computed over extracted
    milestone events (fix-score-progression, D2), so it is 0 in these
    single-turn probes where no milestone extraction has flushed.
2.  The mock-mode fragmented stream (`cantina.\n[Status:` split across chunks,
    plus a duplicated trailing status line) commits via the shared parser.
3.  Echoed [CURRENT STATUS]/[CURRENT INVENTORY] blocks and raw status lines are
    stripped from history and the save file.
4.  The engine is the single owner of `moves`: it increments exactly once per
    turn and ignores the model's Moves field; dungeon_send_action agrees with
    dungeon_inspect_state.
5.  All five prompt definitions declare the same status-line format.

Engine-level scenarios run an AdventureEngine in a Node subprocess with a
scripted narration stream (MOCK_LLM=1), following the node-probe pattern from
tests/test_shared_status_parser.py.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_SOURCE_PATH = os.path.join(REPO_ROOT, "engine", "index.js")
PRESETS_SOURCE_PATH = os.path.join(REPO_ROOT, "engine", "storyPresets.js")

# The exact status-line format every prompt definition must declare. This is
# the contract the shared parseStatusLine expects.
STATUS_FORMAT_TEMPLATE = "[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]"

# Engine-level probe: runs an AdventureEngine in mock mode with a scripted
# narration stream, then reports the committed state, history, and save file.
ENGINE_PROBE = """
import fs from 'fs/promises';
import path from 'path';
import { AdventureEngine } from './engine/index.js';

const scenario = %(scenario_json)s;
const saveDir = scenario.saveDir;

const engine = new AdventureEngine(saveDir);
await engine.newAdventure("Probe Test", scenario.systemPrompt || null);

if (scenario.chunks) {
    const client = engine.llm.client;
    const originalCreate = client.chat.completions.create.bind(client);
    client.chat.completions.create = function (options) {
        if (options.stream) {
            return (async function* () {
                for (const piece of scenario.chunks) {
                    yield { choices: [{ delta: { content: piece } }] };
                }
            })();
        }
        return originalCreate(options);
    };
}

const events = [];
for await (const ev of engine.generateResponseStream("do", scenario.action || "look around")) {
    events.push({ type: ev.type, content: ev.content || null });
}

// Let the background extraction/summarization settle before reading the save.
await new Promise(r => setTimeout(r, 250));

const savePath = path.join(saveDir, engine.adventureId + ".json");
let save = null;
try {
    save = JSON.parse(await fs.readFile(savePath, "utf-8"));
} catch (e) {}

console.log(JSON.stringify({
    state: { location: engine.location, score: engine.score, moves: engine.moves },
    history: engine.history,
    save: save ? {
        history: save.history,
        location: save.location,
        score: save.score,
        moves: save.moves
    } : null,
    events
}));
"""


def run_engine_probe(chunks, action="look around", system_prompt=None):
    """Run the engine-level probe in a Node subprocess and return its JSON result."""
    save_dir = tempfile.mkdtemp(dir=os.path.join(REPO_ROOT, "tests"))
    scenario = {
        "saveDir": save_dir,
        "chunks": chunks,
        "action": action,
    }
    if system_prompt is not None:
        scenario["systemPrompt"] = system_prompt
    try:
        script = ENGINE_PROBE % {"scenario_json": json.dumps(scenario)}
        env = os.environ.copy()
        env["MOCK_LLM"] = "1"
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
        )
        if proc.returncode != 0:
            raise AssertionError(
                f"Engine probe failed ({proc.returncode}):\n"
                f"stdout: {proc.stdout}\nstderr: {proc.stderr}"
            )
        return json.loads(proc.stdout.strip().splitlines()[-1])
    finally:
        shutil.rmtree(save_dir, ignore_errors=True)


def assistant_texts(result):
    """The committed assistant-turn texts from a probe result."""
    return [
        e["text"]
        for e in result["history"]
        if e.get("role") == "assistant"
    ]


class TestEngineCommitsStatusWithTrailingContent(unittest.TestCase):
    """Task 1.1 — status line followed by trailing content is parsed (last line)."""

    CHUNKS = [
        "You step into the tavern.\n",
        "[STATUS: Ashfall Market | Score: 3 | Moves: 7]\nThe barman nods at you.",
    ]

    def test_commits_location_but_score_is_engine_computed(self):
        """Location commits from the status line; score is engine-computed.

        The model's `Score: 3` claim is advisory only (D2). In this single-turn
        probe no milestone extraction has flushed, so the engine-computed score
        is 0, not 3.
        """
        result = run_engine_probe(self.CHUNKS)
        self.assertEqual(result["state"]["location"], "Ashfall Market")
        self.assertEqual(result["state"]["score"], 0)

    def test_moves_incremented_once_per_turn_not_adopted_from_model(self):
        result = run_engine_probe(self.CHUNKS)
        # Model says Moves: 7, but the engine owns the counter.
        self.assertEqual(result["state"]["moves"], 1)

    def test_status_line_not_committed_to_history(self):
        result = run_engine_probe(self.CHUNKS)
        texts = assistant_texts(result)
        self.assertEqual(len(texts), 1)
        self.assertIn("You step into the tavern.", texts[0])
        self.assertIn("The barman nods at you.", texts[0])
        self.assertNotIn("[STATUS:", texts[0])
        self.assertNotIn("Ashfall Market", texts[0])


class TestEngineBufferedFragmentCommit(unittest.TestCase):
    """Task 1.2 — the mock-mode fragmented stream commits via the shared parser.

    The mock LLM streams the narrative word-by-word AND then yields a trailing
    duplicate `\n[Status: Cantina | Score: 5]` chunk, so the raw assistant text
    contains two status lines. The engine must commit the last one and leave no
    status line in history (the MCP-change divergence finding).
    """

    @staticmethod
    def mock_style_chunks():
        narrative = "You walk south into the noisy cantina.\n[Status: Cantina | Score: 5]"
        chunks = [word + " " for word in narrative.split(" ")]
        chunks.append("\n[Status: Cantina | Score: 5]")
        return chunks

    def test_fragmented_stream_commits_status(self):
        result = run_engine_probe(self.mock_style_chunks())
        # Location commits from the status line; the model's Score: 5 claim is
        # ignored — score is engine-computed and 0 here (no milestone flushed).
        self.assertEqual(result["state"]["location"], "Cantina")
        self.assertEqual(result["state"]["score"], 0)

    def test_fragmented_stream_moves_increment_once(self):
        result = run_engine_probe(self.mock_style_chunks())
        self.assertEqual(result["state"]["moves"], 1)

    def test_no_status_line_in_history(self):
        result = run_engine_probe(self.mock_style_chunks())
        texts = assistant_texts(result)
        self.assertEqual(len(texts), 1)
        self.assertEqual(texts[0].strip(), "You walk south into the noisy cantina.")
        self.assertNotIn("[Status:", texts[0])

    def test_buffered_status_line_not_flashed_to_client(self):
        """The withheld buffered status line must not be streamed as a chunk."""
        result = run_engine_probe(self.mock_style_chunks())
        chunked = "".join(
            e["content"] for e in result["events"] if e["type"] == "chunk"
        )
        self.assertNotIn("[Status:", chunked)


class TestHistorySanitization(unittest.TestCase):
    """Task 1.3 — echoed blocks + raw status line stripped from history/save."""

    CHUNKS = [
        "You rummage through your pack.\n",
        "[CURRENT STATUS]\n- Location: Market Square\n- Score: 2\n- Moves: 5\n\n",
        "[CURRENT INVENTORY]\n- Rusty Gear (x1): An old gear\n\n",
        "[Status: Market Square | Score: 2 | Moves: 5]",
    ]

    def test_history_contains_only_sanitized_narration(self):
        result = run_engine_probe(self.CHUNKS)
        texts = assistant_texts(result)
        self.assertEqual(len(texts), 1)
        self.assertEqual(texts[0].strip(), "You rummage through your pack.")
        self.assertNotIn("[CURRENT", texts[0])
        self.assertNotIn("[Status:", texts[0])

    def test_save_file_history_is_sanitized(self):
        result = run_engine_probe(self.CHUNKS)
        self.assertIsNotNone(result["save"])
        save_texts = [
            e["text"]
            for e in result["save"]["history"]
            if e.get("role") == "assistant"
        ]
        self.assertEqual(len(save_texts), 1)
        self.assertEqual(save_texts[0].strip(), "You rummage through your pack.")
        self.assertNotIn("[CURRENT", save_texts[0])
        self.assertNotIn("[Status:", save_texts[0])

    def test_save_state_committed_from_parsed_status(self):
        result = run_engine_probe(self.CHUNKS)
        # Location persists from the parsed status line; score is engine-computed
        # (0 here — no milestone extraction flushed in a single-turn probe), so
        # the save carries 0, not the model's `Score: 2` claim.
        self.assertEqual(result["save"]["location"], "Market Square")
        self.assertEqual(result["save"]["score"], 0)

    def test_user_turn_with_echoed_block_is_sanitized(self):
        # A user turn containing an echoed block must also be sanitized before
        # commit (D3 applies sanitizeForHistory at all push sites).
        result = run_engine_probe(
            ["The tavern is quiet.\n", "[Status: Bar | Score: 1]"],
            action="[CURRENT INVENTORY]\n- fake item",
        )
        user_texts = [
            e["text"]
            for e in result["history"]
            if e.get("role") == "user"
        ]
        self.assertEqual(len(user_texts), 1)
        self.assertNotIn("[CURRENT INVENTORY]", user_texts[0])
        self.assertNotIn("fake item", user_texts[0])


class TestMovesSingleOwner(unittest.TestCase):
    """Task 1.4 (engine side) — the model's Moves field is advisory, ignored."""

    def test_engine_ignores_model_moves_field(self):
        result = run_engine_probe([
            "You enter the vault.\n",
            "[Status: Vault | Score: 3 | Moves: 99]",
        ])
        self.assertEqual(result["state"]["location"], "Vault")
        # Model's Score: 3 claim is ignored; score is engine-computed (0 here).
        self.assertEqual(result["state"]["score"], 0)
        # Engine owns the counter: exactly one increment per completed turn.
        self.assertEqual(result["state"]["moves"], 1)

    def test_two_field_status_line_increments_once(self):
        # The mock's two-field line (no Moves) still increments exactly once.
        result = run_engine_probe([
            "You walk north.\n",
            "[Status: North Field | Score: 1]",
        ])
        self.assertEqual(result["state"]["moves"], 1)
        self.assertEqual(result["state"]["location"], "North Field")


@pytest.mark.integration
class TestMovesAndStateAgreementMCP(McpTestCase):
    """Task 1.4 (MCP side) — dungeon_send_action agrees with dungeon_inspect_state.

    In mock mode the status line is the two-field `[Status: Cantina | Score: 5]`
    (no Moves), so moves must come from the engine's single deterministic
    counter, location from the engine-committed parse, and score from the
    engine's milestone rule (the narrator's `Score: 5` is advisory only).
    """

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Moves Single Owner")

    def _json(self, response):
        result = assert_tool_result(response)
        return json.loads(result["content"][0].get("text", ""))

    def test_moves_increment_exactly_once_per_turn_and_agree(self):
        for expected in (1, 2):
            action = self._json(self.client.send_action("look around"))
            state = self._json(self.client.call_tool("dungeon_inspect_state"))
            self.assertEqual(action["moves"], expected)
            self.assertEqual(action["moves"], state["moves"])

    def test_send_action_location_score_agree_with_inspect_state(self):
        """The engine commits the fragmented mock status line's location, so the
        MCP surface and persisted state agree on location; score is
        engine-computed (0 here — "look around" extracts only a zero-weight
        dialogue event in mock mode), so send_action and inspect_state report
        the same engine score rather than the narrator's `Score: 5` claim."""
        action = self._json(self.client.send_action("look around"))
        state = self._json(self.client.call_tool("dungeon_inspect_state"))
        self.assertEqual(action["location"], "Cantina")
        self.assertEqual(action["location"], state["location"])
        self.assertEqual(action["score"], state["score"])
        self.assertEqual(action["score"], 0)
        self.assertEqual(action["moves"], state["moves"])

    def test_history_contains_only_sanitized_narration_via_mcp(self):
        self.client.send_action("look around")
        history = self._json(self.client.call_tool("dungeon_inspect_history"))
        for entry in history:
            self.assertNotIn("[Status:", entry.get("text", ""))
            self.assertNotIn("[CURRENT", entry.get("text", ""))


class TestPromptContract(unittest.TestCase):
    """Task 1.5 — all five prompt definitions declare the status-line format."""

    def _default_prompt(self):
        with open(INDEX_SOURCE_PATH, encoding="utf-8") as f:
            source = f.read()
        match = re.search(r"DEFAULT_SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`", source)
        self.assertIsNotNone(match, "DEFAULT_SYSTEM_PROMPT not found in engine/index.js")
        return match.group(1)

    def _preset_prompts(self):
        with open(PRESETS_SOURCE_PATH, encoding="utf-8") as f:
            source = f.read()
        return re.findall(r'"system_prompt"\s*:\s*"((?:[^"\\]|\\.)*)"', source)

    def test_default_system_prompt_declares_status_format(self):
        self.assertIn(STATUS_FORMAT_TEMPLATE, self._default_prompt())

    def test_all_four_presets_declare_status_format(self):
        presets = self._preset_prompts()
        self.assertEqual(len(presets), 4)
        for prompt in presets:
            self.assertIn(STATUS_FORMAT_TEMPLATE, prompt)


if __name__ == "__main__":
    unittest.main()
