"""
Extractor-output validation tests (validate-memory-extraction).

Group 1 — TDD scaffolding for the change:

1.1  validateExtractorOutput rejects malformed rows (missing fields, invalid
     types) and memoryManager does not write them to SQLite; valid rows in the
     same batch still flow through.
1.2  Lore trigger filtering: single common words and mechanical vocabulary are
     rejected; valid multi-word triggers survive; a card whose entire trigger
     list is rejected is dropped.
1.3  normalizeInventoryChange parses a leading numeral out of `item_name` into
     the `quantity` field so counts are not double-encoded.
1.4  Equivalent item names (Rusty/Rusted stem, case, articles) resolve to the
     same canonical item on write and read.
1.5  The summarization prompt holds second person, and the committed summary is
     sanitized like every other assistant text.

Where the logic is a pure engine function we probe it in a Node subprocess
(node-probe pattern from tests/test_shared_status_parser.py); where it must
exercise the SQLite store we probe MemoryManager/StructuredStore directly.
"""
import json
import os
import re
import subprocess
import sys
import unittest

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTEXT_SOURCE_PATH = os.path.join(REPO_ROOT, "engine", "context.js")


def _run_node_probe(script, timeout=60):
    """Run a Node ESM probe from the repo root and return the parsed JSON."""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise AssertionError(
            f"Node probe failed ({proc.returncode}):\n"
            f"stdout: {proc.stdout}\nstderr: {proc.stderr}"
        )
    return json.loads(proc.stdout.strip().splitlines()[-1])


# ─────────────────────────────────────────────────────────────────────────────
# 1.1 — malformed extractor output is rejected, not persisted
# ─────────────────────────────────────────────────────────────────────────────

VALIDATION_PROBE = """
import { validateExtractorOutput } from './engine/memory/eventExtractor.js';
const output = %(output_json)s;
const result = validateExtractorOutput(output);
console.log(JSON.stringify(result));
"""

# A batch mixing well-formed rows with malformed ones. The malformed rows must
# be rejected while the valid rows pass through unchanged.
MIXED_BATCH = {
    "events": [
        {"type": "discovery", "summary": "Found a gem.", "entities": ["gem"], "location": "Cave"},
        {"type": "discovery"},                                              # missing summary
        {"type": 123, "summary": "Numeric type event."},                    # invalid type
        {"summary": "No type here."},                                       # missing type
    ],
    "inventory_changes": [
        {"action": "acquire", "item_name": "Silver Ring", "item_type": "misc", "quantity": 1},
        {"action": "acquire", "item_type": "misc", "quantity": 2},          # missing item_name
        {"action": "acquire", "item_name": "Broken Pendant", "quantity": "lots"},  # invalid qty
        {"action": "acquire", "item_name": "Negative Gem", "quantity": -3}, # negative qty
    ],
    "lore_facts": [
        {"name": "Cave Keeper", "type": "character", "description": "d", "trigger_words": ["keeper", "cave"]},
        {"type": "location", "description": "d", "trigger_words": ["room"]},  # missing name
        {"name": "Trade Guild", "type": "faction", "description": "d", "trigger_words": ["trade"]},
        {"name": "Odd Person", "type": "person", "description": "d", "trigger_words": ["odd person"]},  # out-of-enum type
        {"name": "Numeric Type", "type": 42, "description": "d", "trigger_words": ["numeric type"]},   # invalid type
    ],
    "offers": [],
    "goals": [],
}


class TestValidateExtractorOutput(unittest.TestCase):
    """1.1 — malformed rows are rejected; valid rows pass through."""

    @classmethod
    def setUpClass(cls):
        script = VALIDATION_PROBE % {"output_json": json.dumps(MIXED_BATCH)}
        cls.result = _run_node_probe(script)

    def test_valid_event_passes_through(self):
        events = self.result["events"]
        self.assertEqual(
            [e["summary"] for e in events],
            ["Found a gem."],
        )

    def test_malformed_events_rejected_and_counted(self):
        self.assertEqual(self.result["rejected"]["events"], 3)

    def test_valid_inventory_change_passes_through(self):
        changes = self.result["inventory_changes"]
        self.assertEqual(
            [c["item_name"] for c in changes],
            ["Silver Ring"],
        )

    def test_malformed_inventory_changes_rejected_and_counted(self):
        self.assertEqual(self.result["rejected"]["inventory_changes"], 3)

    def test_valid_lore_fact_passes_through(self):
        facts = self.result["lore_facts"]
        names = [f["name"] for f in facts]
        self.assertEqual(names, ["Cave Keeper"])
        self.assertEqual(facts[0]["trigger_words"], ["keeper", "cave"])

    def test_malformed_lore_facts_rejected_and_counted(self):
        # missing name, all-common-word trigger, out-of-enum type, numeric type
        self.assertEqual(self.result["rejected"]["lore_facts"], 4)

    def test_out_of_enum_lore_type_rejected(self):
        """A lore fact whose type is outside character|location|item|lore|faction
        is rejected (string out-of-enum and non-string alike)."""
        facts = self.result["lore_facts"]
        self.assertEqual([f["name"] for f in facts], ["Cave Keeper"])
        self.assertEqual(self.result["rejected"]["lore_facts"], 4)


# MemoryManager probe: a stubbed extractor feeds a mixed batch through the real
# write path; only valid rows may reach SQLite.
MEMORY_MANAGER_PROBE = """
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MemoryManager } from './engine/memory/memoryManager.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-mm-'));
const mm = new MemoryManager(dataDir, {}, {
    embedBatch: async (texts) => texts.map(() => Array(768).fill(0)),
    embed: async () => Array(768).fill(0)
});
mm.initialize('adv1');

mm.eventExtractor.extractEvents = async () => (%(extracted_json)s);

const state = { adventureId: 'adv1', cards: [] };
await mm._extractAndStore(
    [{ turnIndex: 1, player: 'take the silver ring', dm: 'You take it.' }],
    state,
    'mock',
    async () => {}
);

const stats = mm.structuredStore.getStats('adv1');
const inventory = mm.structuredStore.getInventory('adv1');
console.log(JSON.stringify({
    events: stats.events,
    inventory: stats.inventory,
    lore: stats.lore,
    inventoryNames: inventory.map(i => i.item_name),
    numericTypeEvents: mm.structuredStore.db.prepare(
        "SELECT COUNT(*) AS c FROM events WHERE event_type NOT IN ('combat','dialogue','discovery','quest','death','trade','movement')"
    ).get().c,
    nonNumericQuantity: mm.structuredStore.db.prepare(
        "SELECT COUNT(*) AS c FROM inventory WHERE typeof(quantity) = 'text'"
    ).get().c
}));
"""

# Batch where each malformed row WOULD today be persisted (a numeric event type,
# a text quantity, and a common-word lore trigger), plus one valid row per
# section to prove extraction continues with the valid rows.
MM_MIXED_BATCH = {
    "events": [
        {"type": "discovery", "summary": "Found a gem.", "entities": [], "location": "Cave"},
        {"type": 123, "summary": "Numeric type event.", "entities": [], "location": "Cave"},
    ],
    "inventory_changes": [
        {"action": "acquire", "item_name": "Silver Ring", "item_type": "misc", "quantity": 1},
        {"action": "acquire", "item_name": "Broken Pendant", "item_type": "misc", "quantity": "lots"},
    ],
    "lore_facts": [
        {"name": "Cave Keeper", "type": "character", "description": "d", "trigger_words": ["keeper", "cave"]},
        {"name": "Trade Guild", "type": "faction", "description": "d", "trigger_words": ["trade"]},
    ],
    "offers": [],
    "goals": [],
}


class TestInvalidRowsNotWrittenToSqlite(unittest.TestCase):
    """1.1 — invalid extractor rows are skipped; valid rows in the same batch survive."""

    @classmethod
    def setUpClass(cls):
        script = MEMORY_MANAGER_PROBE % {"extracted_json": json.dumps(MM_MIXED_BATCH)}
        cls.result = _run_node_probe(script)

    def test_only_valid_event_written(self):
        self.assertEqual(self.result["events"], 1)
        self.assertEqual(self.result["numericTypeEvents"], 0)

    def test_only_valid_inventory_change_written(self):
        self.assertEqual(self.result["inventory"], 1)
        self.assertEqual(self.result["inventoryNames"], ["Silver Ring"])
        self.assertEqual(self.result["nonNumericQuantity"], 0)

    def test_only_valid_lore_fact_written(self):
        self.assertEqual(self.result["lore"], 1)


# ─────────────────────────────────────────────────────────────────────────────
# 1.2 — trigger filtering
# ─────────────────────────────────────────────────────────────────────────────

TRIGGER_PROBE = """
import { validateExtractorOutput } from './engine/memory/eventExtractor.js';
const facts = %(facts_json)s;
const result = validateExtractorOutput({ events: [], inventory_changes: [], lore_facts: facts, offers: [], goals: [] });
console.log(JSON.stringify({ kept: result.lore_facts, rejected: result.rejected.lore_facts }));
"""

TRIGGER_CASES = [
    # (name, trigger_words, kept_expected)
    ("BadTrade", ["trade"], None),
    ("BadScore", ["score"], None),
    ("BadNorth", ["north", "door"], None),
    ("BadAdmin", ["admin", "score", "system prompt"], None),
    ("BadShort", ["R2"], None),
    ("BadMechanical", ["inventory", "status"], None),
    ("GoodMultiWord", ["wandering trader", "ashfall market"], ["wandering trader", "ashfall market"]),
    ("GoodKorr", ["korr", "smuggler"], ["korr", "smuggler"]),
    ("Mixed", ["rusty gear", "door"], ["rusty gear"]),
]


class TestTriggerFiltering(unittest.TestCase):
    """1.2 — common-word and mechanical triggers are rejected; valid ones survive."""

    @classmethod
    def setUpClass(cls):
        facts = [
            {"name": name, "type": "location", "description": "d", "trigger_words": words}
            for name, words, _ in TRIGGER_CASES
        ]
        script = TRIGGER_PROBE % {"facts_json": json.dumps(facts)}
        cls.result = _run_node_probe(script)

    def test_common_word_triggers_rejected(self):
        self.assertEqual(self.result["rejected"], 6)

    def test_kept_cards_have_only_valid_triggers(self):
        kept = {f["name"]: f["trigger_words"] for f in self.result["kept"]}
        self.assertEqual(set(kept), {"GoodMultiWord", "GoodKorr", "Mixed"})

    def test_multi_word_triggers_survive(self):
        kept = {f["name"]: f["trigger_words"] for f in self.result["kept"]}
        self.assertEqual(kept["GoodMultiWord"], ["wandering trader", "ashfall market"])

    def test_invalid_triggers_are_pruned_not_whole_card(self):
        kept = {f["name"]: f["trigger_words"] for f in self.result["kept"]}
        self.assertEqual(kept["Mixed"], ["rusty gear"])

    def test_korr_card_survives(self):
        kept = {f["name"]: f["trigger_words"] for f in self.result["kept"]}
        self.assertEqual(kept["GoodKorr"], ["korr", "smuggler"])


@pytest.mark.integration
class TestMockExtractionSurvivesValidation(McpTestCase):
    """1.2 — mock-mode fixtures pass the new validation (regression guard).

    The mock extractor's lore fixtures (["korr", "smuggler"]) and inventory
    fixtures (Leaflet, Gem, Rusty Sword, Iron Key) must survive validation, so
    existing mock-mode tests keep passing once validation is wired in.
    """

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Validation Mock Survival")

    def _json(self, response):
        result = assert_tool_result(response)
        return json.loads(result["content"][0].get("text", ""))

    def _lore(self):
        return self._json(self.client.call_tool("dungeon_inspect_lore"))

    def test_mock_lore_triggers_are_valid(self):
        # "Korr stands in the cantina" triggers the mock Korr lore card.
        self.client.send_action("Korr stands in the cantina")
        lore = self._lore()
        self.assertTrue(
            any(c["name"] == "Korr" for c in lore),
            f"expected the Korr card in {lore}",
        )
        for card in lore:
            for trigger in card.get("triggers", []):
                self.assertGreaterEqual(len(trigger.strip()), 3)
                self.assertNotIn(trigger.lower(), {"trade", "score", "north", "door"})

    def test_mock_inventory_still_resolves_after_canonicalization(self):
        self.client.send_action("take the leaflet")
        inventory = self._json(self.client.call_tool("dungeon_inspect_inventory"))
        names = [i["item_name"].lower() for i in inventory]
        self.assertIn("leaflet", names)


# ─────────────────────────────────────────────────────────────────────────────
# 1.3 — quantity parsing out of item_name
# ─────────────────────────────────────────────────────────────────────────────

NORMALIZE_PROBE = """
import { normalizeInventoryChange } from './engine/memory/structuredStore.js';
const cases = %(cases_json)s;
const out = {};
for (const [key, c] of Object.entries(cases)) {
    out[key] = normalizeInventoryChange(c);
}
console.log(JSON.stringify(out));
"""

NORMALIZE_CASES = {
    "coppers": {"action": "acquire", "item_name": "2 Coppers", "item_type": "misc", "description": None, "quantity": 1},
    "coppers_already_counted": {"action": "acquire", "item_name": "2 Coppers", "quantity": 2},
    "silver_ring": {"action": "acquire", "item_name": "Silver Ring", "quantity": 1},
    "no_qty_field": {"action": "acquire", "item_name": "3 Iron Keys"},
    "no_numeral": {"action": "acquire", "item_name": "the gem"},
}


class TestNormalizeInventoryChange(unittest.TestCase):
    """1.3 — a leading numeral in item_name is parsed into quantity."""

    @classmethod
    def setUpClass(cls):
        script = NORMALIZE_PROBE % {"cases_json": json.dumps(NORMALIZE_CASES)}
        cls.result = _run_node_probe(script)

    def test_numeral_parsed_into_quantity_and_stripped_from_name(self):
        r = self.result["coppers"]
        self.assertEqual(r["item_name"], "coppers")
        self.assertEqual(r["quantity"], 2)

    def test_numeral_is_authoritative_over_stale_quantity_field(self):
        r = self.result["coppers_already_counted"]
        self.assertEqual(r["item_name"], "coppers")
        self.assertEqual(r["quantity"], 2)

    def test_plain_name_keeps_quantity_and_is_canonicalized(self):
        r = self.result["silver_ring"]
        self.assertEqual(r["item_name"], "silver ring")
        self.assertEqual(r["quantity"], 1)

    def test_missing_quantity_field_defaults_from_numeral(self):
        r = self.result["no_qty_field"]
        self.assertEqual(r["item_name"], "iron keys")
        self.assertEqual(r["quantity"], 3)

    def test_article_stripped_and_quantity_defaults_to_one(self):
        r = self.result["no_numeral"]
        self.assertEqual(r["item_name"], "gem")
        self.assertEqual(r["quantity"], 1)


# Store-level probe: quantity-encoded names land in the quantity column, not the name.
STORE_QTY_PROBE = """
import fs from 'fs';
import os from 'os';
import path from 'path';
import { StructuredStore } from './engine/memory/structuredStore.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-qty-'));
const store = new StructuredStore(dataDir);
store.initAdventure('adv1');
store.upsertInventoryItem('adv1', { item_name: '2 Coppers', item_type: 'misc', description: null, quantity: 1, status: 'held' });
store.upsertInventoryItem('adv1', { item_name: 'Silver Ring', item_type: 'misc', description: null, quantity: 1, status: 'held' });
const inv = store.getInventory('adv1');
console.log(JSON.stringify(inv.map(i => ({ item_name: i.item_name, quantity: i.quantity }))));
"""


class TestQuantityStoredInColumnNotName(unittest.TestCase):
    """1.3 — SQLite rows carry the count in `quantity`, the numeral removed from item_name."""

    @classmethod
    def setUpClass(cls):
        cls.result = _run_node_probe(STORE_QTY_PROBE)

    def test_coppers_row_has_quantity_column(self):
        # The display name keeps the narrated casing ("Coppers") but the count
        # lives in the `quantity` column, not the name.
        coppers = [i for i in self.result if i["item_name"].lower() == "coppers"]
        self.assertEqual(len(coppers), 1)
        self.assertEqual(coppers[0]["quantity"], 2)

    def test_stored_name_has_no_count(self):
        names = [i["item_name"] for i in self.result]
        self.assertNotIn("2 Coppers", names)
        self.assertTrue(
            any(n.lower() == "silver ring" for n in names),
            f"expected a silver-ring row in {names}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# 1.4 — name canonicalization (Rusty/Rusted, case, articles)
# ─────────────────────────────────────────────────────────────────────────────

ITEM_MATCH_PROBE = """
import { itemNamesMatch, normalizeItemName } from './engine/memory/itemNames.js';
const pairs = %(pairs_json)s;
const out = pairs.map(([a, b]) => ({ a, b, match: itemNamesMatch(a, b) }));
out.canonical = {
    '2 Coppers': normalizeItemName('2 Coppers'),
    'the Gem': normalizeItemName('the Gem'),
    'RUSTY GEAR': normalizeItemName('RUSTY GEAR'),
};
console.log(JSON.stringify(out));
"""

MATCH_PAIRS = [
    ("Rusty Gear", "Rusted Gear"),      # stem difference
    ("Rusty Gear", "rusty gear"),       # case
    ("the Gem", "Gem"),                 # article + case
    ("2 Coppers", "coppers"),           # leading numeral stripped
    ("Silver Ring", "silver ring"),     # case
    ("Gem", "Gems"),                    # plural stem
    ("gem", "germ"),                    # must NOT falsely match (distinct root)
    ("Leaflet", "Leaflet"),
]


class TestItemNameMatching(unittest.TestCase):
    """1.4 — equivalent names match; distinct names do not."""

    @classmethod
    def setUpClass(cls):
        script = ITEM_MATCH_PROBE % {"pairs_json": json.dumps(MATCH_PAIRS)}
        cls.result = _run_node_probe(script)

    def _match(self, a, b):
        for entry in self.result:
            if entry["a"] == a and entry["b"] == b:
                return entry["match"]
        raise KeyError(f"pair ({a!r}, {b!r}) not probed")

    def test_rusty_rusted_stem_match(self):
        self.assertTrue(self._match("Rusty Gear", "Rusted Gear"))

    def test_case_insensitive_match(self):
        self.assertTrue(self._match("Rusty Gear", "rusty gear"))
        self.assertTrue(self._match("Silver Ring", "silver ring"))

    def test_article_and_numeral_normalization(self):
        self.assertTrue(self._match("the Gem", "Gem"))
        self.assertTrue(self._match("2 Coppers", "coppers"))

    def test_plural_stem_match(self):
        self.assertTrue(self._match("Gem", "Gems"))

    def test_distinct_names_do_not_match(self):
        self.assertFalse(self._match("gem", "germ"))

    def test_exact_match_unchanged(self):
        self.assertTrue(self._match("Leaflet", "Leaflet"))


# Store-level probe: equivalent names resolve to the same held row on read, and
# executeTrade's required-item lookup resolves by canonical name. A legacy
# quantity-encoded row ("2 Coppers") is written directly via SQL to simulate
# data stored before name normalization landed.
STORE_READ_PROBE = """
import fs from 'fs';
import os from 'os';
import path from 'path';
import { StructuredStore } from './engine/memory/structuredStore.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-read-'));
const store = new StructuredStore(dataDir);
store.initAdventure('adv1');
store.upsertInventoryItem('adv1', { item_name: 'Rusty Gear', item_type: 'misc', quantity: 1, status: 'held' });
// Legacy row written before quantity parsing: the count lives in the name.
store.db.prepare(
    "INSERT INTO inventory (id, adventure_id, item_name, item_type, quantity, status) VALUES (?, ?, ?, ?, ?, ?)"
).run('adv1:2_coppers_legacy', 'adv1', '2 Coppers', 'misc', 1, 'held');

const byRusted = store.hasItem('adv1', 'Rusted Gear');
const byCoppers = store.hasItem('adv1', 'Coppers');

let tradeOutcome = 'no-throw';
let tradeError = null;
try {
    store.executeTrade('adv1', 'rusted gear', 'Gem', 'A gem.', 'misc');
    const gemRow = store.hasItem('adv1', 'the gem');
    tradeOutcome = gemRow ? 'gem-held' : 'gem-missing';
} catch (e) {
    tradeError = e.message;
}

const inv = store.getInventory('adv1');
console.log(JSON.stringify({
    byRusted: byRusted && byRusted.item_name,
    byCoppers: byCoppers && { item_name: byCoppers.item_name, quantity: byCoppers.quantity },
    tradeOutcome,
    tradeError,
    heldNames: inv.map(i => i.item_name)
}));
"""


class TestCanonicalReadResolution(unittest.TestCase):
    """1.4 — legacy/drifted spellings resolve to the canonical held row on read."""

    @classmethod
    def setUpClass(cls):
        cls.result = _run_node_probe(STORE_READ_PROBE)

    def test_has_item_resolves_stem_variant(self):
        self.assertEqual(self.result["byRusted"], "Rusty Gear")

    def test_has_item_resolves_quantity_encoded_legacy_row(self):
        # A pre-canonicalization row storing "2 Coppers" (count in the name)
        # must still resolve when a lookup uses the plain "Coppers".
        self.assertIsNotNone(self.result["byCoppers"])
        self.assertEqual(self.result["byCoppers"]["item_name"], "2 Coppers")

    def test_execute_trade_resolves_canonical_name(self):
        self.assertEqual(self.result["tradeOutcome"], "gem-held")
        self.assertIsNone(self.result["tradeError"])


# ─────────────────────────────────────────────────────────────────────────────
# 1.5 — summarization voice + sanitized commit
# ─────────────────────────────────────────────────────────────────────────────

class TestSummaryPromptSecondPerson(unittest.TestCase):
    """1.5 — the summarization prompt mandates second person."""

    def test_prompt_requires_second_person(self):
        with open(CONTEXT_SOURCE_PATH, encoding="utf-8") as f:
            source = f.read()
        match = re.search(
            r"const prompt = `(.*?)`;",
            source,
            re.DOTALL,
        )
        self.assertIsNotNone(match, "summary prompt template not found in engine/context.js")
        prompt = match.group(1)
        self.assertIn("second person", prompt)
        self.assertIn('"you"', prompt)
        self.assertNotIn("third person", prompt)
        # The prompt must forbid the third-person label the summarizer drifted
        # to (GH #14), not silently allow it.
        self.assertIn("protagonist", prompt)


SUMMARY_PROBE = """
import { ContextManager } from './engine/context.js';

const cm = new ContextManager();
const state = {
    history: [
        { role: 'user', text: 'You look around the cave.' },
        { role: 'assistant', text: 'The cave walls glisten.' },
        { role: 'user', text: 'You head north.' },
        { role: 'assistant', text: 'You reach a forest.' }
    ],
    archivedHistory: [],
    summary: 'The adventure has just begun.'
};

const rawSummary = %(summary_json)s;
const client = {
    chat: { completions: { create: async () => ({ choices: [{ message: { content: rawSummary } }] }) } }
};

let saved = false;
await cm.summarizeOldTurns(state, client, 'mock', async () => { saved = true; });

console.log(JSON.stringify({
    summary: state.summary,
    historyLen: state.history.length,
    archivedLen: state.archivedHistory.length,
    saved
}));
"""


class TestSummaryCommitSanitized(unittest.TestCase):
    """1.5 — the committed summary is sanitized like every other assistant text."""

    RAW_SUMMARY = (
        "You found the entrance to the ruins.\n"
        "[CURRENT STATUS]\n- Location: Ruins\n- Score: 1\n- Moves: 3\n\n"
        "[Status: Ruins | Score: 1 | Moves: 3]"
    )

    @classmethod
    def setUpClass(cls):
        script = SUMMARY_PROBE % {"summary_json": json.dumps(cls.RAW_SUMMARY)}
        cls.result = _run_node_probe(script)

    def test_summary_committed(self):
        self.assertTrue(self.result["saved"])
        self.assertIn("You found the entrance to the ruins.", self.result["summary"])

    def test_echoed_metadata_stripped_from_summary(self):
        summary = self.result["summary"]
        self.assertNotIn("[CURRENT STATUS]", summary)
        self.assertNotIn("[Status:", summary)
        self.assertNotIn("Ruins", summary.replace("You found the entrance to the ruins.", ""))

    def test_turns_archived(self):
        self.assertEqual(self.result["historyLen"], 0)
        self.assertEqual(self.result["archivedLen"], 4)


if __name__ == "__main__":
    unittest.main()
