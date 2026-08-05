import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { normalizeItemName, itemNamesMatch } from './itemNames.js';
import { roomNamesMatch } from './roomMap.js';

// Canonicalize an extractor inventory-change row before it is written:
//  - a leading quantity numeral ("2 Coppers") is parsed out of `item_name`
//    into the `quantity` field so counts are not double-encoded (D3);
//  - `item_name` is normalized (case, articles, punctuation, the numeral) so
//    equivalent spellings collapse to one canonical identity on read.
export function normalizeInventoryChange(change) {
    if (!change || typeof change !== 'object') return null;
    if (typeof change.item_name !== 'string' || !change.item_name.trim()) return null;

    const quantityMatch = change.item_name.match(/^\s*(\d+)\s+/);
    let quantity = change.quantity;
    if (quantityMatch) {
        quantity = parseInt(quantityMatch[1], 10);
    }
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) {
        quantity = 1;
    }

    return { ...change, item_name: normalizeItemName(change.item_name), quantity };
}

export class StructuredStore {
    constructor(dataDir) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.db = new Database(path.join(dataDir, 'memory.db'));
        this.db.pragma('journal_mode = WAL');
        this._initSchema();
    }

    _initSchema() {
        this.db.exec(`
            -- Tracks the highest turn index that has been extracted per adventure
            CREATE TABLE IF NOT EXISTS extraction_state (
                adventure_id TEXT PRIMARY KEY,
                last_extracted_turn_index INTEGER DEFAULT 0
            );

            -- Every significant event that occurred in the narrative
            CREATE TABLE IF NOT EXISTS events (
                id          TEXT PRIMARY KEY,
                adventure_id TEXT NOT NULL,
                turn_index  INTEGER,
                event_type  TEXT NOT NULL,
                summary     TEXT NOT NULL,
                entities    TEXT,
                location    TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Current inventory state
            CREATE TABLE IF NOT EXISTS inventory (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                item_name       TEXT NOT NULL,
                item_type       TEXT,
                description     TEXT,
                quantity        INTEGER DEFAULT 1,
                acquired_at     TEXT,
                acquired_turn   INTEGER,
                status          TEXT DEFAULT 'held'
            );

            -- Lore/world knowledge (mirrors + extends context cards)
            CREATE TABLE IF NOT EXISTS lore (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                name            TEXT NOT NULL,
                type            TEXT NOT NULL,
                description     TEXT,
                trigger_words   TEXT,
                enabled         INTEGER DEFAULT 1,
                source          TEXT DEFAULT 'auto',
                turn_index      INTEGER
            );

            -- Barter offers (trader requires an item, offers another). Schema
            -- ownership lives here (memory-schema-boundary): BarterEngine is a
            -- thin state machine over these tables and never reaches into the
            -- raw db handle. turn_index attributes a narration-created offer to
            -- its batch turn so full-surface rollback can remove it; NULL means
            -- "no narration turn" (e.g. hand-created) and survives rollback.
            CREATE TABLE IF NOT EXISTS barter_offers (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                trader_name     TEXT NOT NULL,
                required_item   TEXT NOT NULL,
                offered_item    TEXT NOT NULL,
                description     TEXT,
                turn_index      INTEGER
            );

            -- NPC quest goals (objective state machine). Same ownership and
            -- turn_index semantics as barter_offers.
            CREATE TABLE IF NOT EXISTS quest_goals (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                npc_name        TEXT NOT NULL,
                goal_title      TEXT NOT NULL,
                required_item   TEXT NOT NULL,
                reward_item     TEXT NOT NULL,
                status          TEXT DEFAULT 'NOT_STARTED',
                created_turn    INTEGER,
                completed_turn  INTEGER,
                turn_index      INTEGER
            );

            -- Room graph (spatial-map-region-graph, D1). Rooms are nodes keyed
            -- by an opaque engine-assigned id; the canonical display name is
            -- stored separately so a drifting narrator name never re-keys a
            -- room. first_turn stamps discovery for full-surface rollback.
            -- exits carry discovered_turn (NULL = hand-created, survives
            -- rollback); UNIQUE(adventure_id, from_room, direction) makes
            -- re-traversal deterministic and contradiction detectable.
            -- room_visits records every visit by turn and doubles as the undo
            -- re-anchor trail (D5).
            CREATE TABLE IF NOT EXISTS rooms (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                name            TEXT NOT NULL,
                description     TEXT,
                first_turn      INTEGER NOT NULL,
                last_visit_turn INTEGER,
                visit_count     INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS exits (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                from_room       TEXT NOT NULL,
                direction       TEXT NOT NULL,
                to_room         TEXT NOT NULL,
                kind            TEXT DEFAULT 'walk',
                inferred        INTEGER DEFAULT 0,
                discovered_turn INTEGER,
                UNIQUE(adventure_id, from_room, direction)
            );

            CREATE TABLE IF NOT EXISTS room_visits (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                room_id         TEXT NOT NULL,
                turn            INTEGER NOT NULL
            );
        `);
        this._migrateTurnIndexColumns();
    }

    // Guarded migration for existing DBs created before the turn_index column
    // existed (memory-schema-boundary). Each rollback-surface table (lore,
    // barter_offers, quest_goals) gains `turn_index INTEGER` only when the
    // column is missing. Idempotent: re-constructing the store no-ops. Existing
    // rows keep their data; their turn_index is NULL, so they survive rollback.
    _migrateTurnIndexColumns() {
        const columnNames = (table) => new Set(
            this.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
        );
        for (const table of ['lore', 'barter_offers', 'quest_goals']) {
            if (!columnNames(table).has('turn_index')) {
                this.db.exec(`ALTER TABLE ${table} ADD COLUMN turn_index INTEGER`);
            }
        }
    }

    // ─── Extraction State ─────────────────────────────────────────────────────

    getLastExtractedTurnIndex(adventureId) {
        const row = this.db.prepare(
            'SELECT last_extracted_turn_index FROM extraction_state WHERE adventure_id = ?'
        ).get(adventureId);
        return row ? row.last_extracted_turn_index : 0;
    }

    setLastExtractedTurnIndex(adventureId, turnIndex) {
        this.db.prepare(`
            INSERT INTO extraction_state (adventure_id, last_extracted_turn_index)
            VALUES (?, ?)
            ON CONFLICT(adventure_id) DO UPDATE SET last_extracted_turn_index = excluded.last_extracted_turn_index
        `).run(adventureId, turnIndex);
    }

    initAdventure(adventureId) {
        this.db.prepare(`
            INSERT OR IGNORE INTO extraction_state (adventure_id, last_extracted_turn_index)
            VALUES (?, 0)
        `).run(adventureId);
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    insertEvent(adventureId, eventId, turnIndex, eventType, summary, entities, location) {
        this.db.prepare(`
            INSERT OR IGNORE INTO events
                (id, adventure_id, turn_index, event_type, summary, entities, location)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            eventId,
            adventureId,
            turnIndex,
            eventType,
            summary,
            JSON.stringify(entities || []),
            location || null
        );
    }

    getEvents(adventureId, limit = 20) {
        return this.db.prepare(
            'SELECT * FROM events WHERE adventure_id = ? ORDER BY turn_index DESC LIMIT ?'
        ).all(adventureId, limit);
    }

    getEventCount(adventureId) {
        const row = this.db.prepare(
            'SELECT COUNT(*) as count FROM events WHERE adventure_id = ?'
        ).get(adventureId);
        return row ? row.count : 0;
    }

    // ─── Inventory ────────────────────────────────────────────────────────────

    upsertInventoryItem(adventureId, item) {
        // Canonicalize on write (D3): parse any leading quantity numeral into
        // the `quantity` column and derive the row identity from the canonical
        // (normalized) name, so "2 Coppers" and "Coppers" (or "Rusty Gear" and
        // "RUSTY gear") resolve to the same row. The stored display name keeps
        // the narrated spelling minus the quantity numeral.
        const change = normalizeInventoryChange(item) || item;
        const quantity = change.quantity !== undefined ? change.quantity : 1;
        const displayName = String(item.item_name || change.item_name || '')
            .replace(/^\s*\d+\s+/, '');
        const id = `${adventureId}:${normalizeItemName(displayName).replace(/\s+/g, '_')}`;
        this.db.prepare(`
            INSERT INTO inventory
                (id, adventure_id, item_name, item_type, description, quantity, acquired_at, acquired_turn, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                quantity = excluded.quantity,
                description = COALESCE(excluded.description, description)
        `).run(
            id,
            adventureId,
            displayName,
            item.item_type || 'misc',
            item.description || null,
            quantity,
            item.acquired_at || null,
            item.acquired_turn || null,
            item.status || 'held'
        );
    }

    getInventory(adventureId) {
        return this.db.prepare(
            "SELECT * FROM inventory WHERE adventure_id = ? AND status NOT IN ('dropped','destroyed','used','traded')"
        ).all(adventureId);
    }

    // ─── Barter / Trade ────────────────────────────────────────────────────────

    findItemMatches(adventureId, query) {
        const allHeld = this.db.prepare(
            "SELECT * FROM inventory WHERE adventure_id = ? AND status = 'held'"
        ).all(adventureId);
        const lowerQuery = query.toLowerCase();
        return allHeld.filter(i =>
            i.item_name.toLowerCase().includes(lowerQuery) ||
            lowerQuery.includes(i.item_name.toLowerCase())
        );
    }

    hasItem(adventureId, itemName) {
        // Exact (indexed) SQL match first, then canonical/stem fallback over
        // held rows so drifted spellings resolve to the stored item (D3):
        // "Rusted Gear" for stored "Rusty Gear", "Coppers" for stored
        // "2 Coppers", "the gem" for stored "Gem".
        const exact = this.db.prepare(
            "SELECT * FROM inventory WHERE adventure_id = ? AND LOWER(item_name) = LOWER(?) AND status = 'held'"
        ).get(adventureId, itemName);
        if (exact) return exact;
        const held = this.db.prepare(
            "SELECT * FROM inventory WHERE adventure_id = ? AND status = 'held'"
        ).all(adventureId);
        return held.find(i => itemNamesMatch(i.item_name, itemName)) || null;
    }

    executeTrade(adventureId, requiredItemName, offeredItemName, offeredDescription = null, offeredType = 'misc') {
        const trade = this.db.transaction(() => {
            // Find the required item among held rows by canonical name (D3), so
            // a variant spelling still resolves and the trade goes through.
            const held = this.db.prepare(
                "SELECT * FROM inventory WHERE adventure_id = ? AND status = 'held'"
            ).all(adventureId);
            const requiredItem = held.find(i => itemNamesMatch(i.item_name, requiredItemName)) || null;
            
            if (!requiredItem) {
                throw new Error(`Item '${requiredItemName}' not found in inventory or not held.`);
            }

            // Decrease quantity or mark as traded
            if (requiredItem.quantity > 1) {
                this.db.prepare(
                    "UPDATE inventory SET quantity = quantity - 1 WHERE id = ?"
                ).run(requiredItem.id);
            } else {
                this.db.prepare(
                    "UPDATE inventory SET status = 'traded' WHERE id = ?"
                ).run(requiredItem.id);
            }

            // Insert the offered item as 'held', keyed by its canonical name so
            // article/quantity variants collapse to the same row.
            const offerName = normalizeItemName(offeredItemName) || offeredItemName;
            const offerId = `${adventureId}:${offerName.replace(/\s+/g, '_')}`;
            this.db.prepare(`
                INSERT INTO inventory (id, adventure_id, item_name, item_type, description, quantity, status)
                VALUES (?, ?, ?, ?, ?, 1, 'held')
                ON CONFLICT(id) DO UPDATE SET quantity = quantity + 1, status = 'held'
            `).run(
                offerId,
                adventureId,
                offeredItemName,
                offeredType,
                offeredDescription
            );
        });
        
        return trade();
    }

    // ─── Lore ─────────────────────────────────────────────────────────────────

    upsertLore(adventureId, loreId, name, type, description, triggerWords, source = 'auto', turnIndex = null) {
        this.db.prepare(`
            INSERT INTO lore (id, adventure_id, name, type, description, trigger_words, source, turn_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                description = COALESCE(excluded.description, description),
                trigger_words = excluded.trigger_words,
                turn_index = excluded.turn_index
        `).run(
            loreId,
            adventureId,
            name,
            type,
            description || null,
            JSON.stringify(triggerWords || []),
            source,
            this._resolveTurnIndex(adventureId, turnIndex)
        );
    }

    getLore(adventureId, type = null) {
        if (type) {
            return this.db.prepare(
                'SELECT * FROM lore WHERE adventure_id = ? AND type = ? AND enabled = 1'
            ).all(adventureId, type);
        }
        return this.db.prepare(
            'SELECT * FROM lore WHERE adventure_id = ? AND enabled = 1'
        ).all(adventureId);
    }

    /**
     * Delete a lore row by ID (scoped to the adventure). The recovery path for
     * a poisoned/unwanted card (GH #15): removing the row means the card can
     * never be re-synced into `state.cards` or fire again.
     *
     * @returns {boolean} true if a row was deleted
     */
    deleteLore(adventureId, loreId) {
        const info = this.db.prepare(
            'DELETE FROM lore WHERE id = ? AND adventure_id = ?'
        ).run(loreId, adventureId);
        return info.changes > 0;
    }

    // ─── Barter offers & quest goals ───────────────────────────────────────────

    // Highest turn_index across the adventure's events; the attribution anchor
    // for rows written without an explicit narration turn (D4).
    getMaxEventTurnIndex(adventureId) {
        const row = this.db.prepare(
            'SELECT MAX(turn_index) AS max_turn FROM events WHERE adventure_id = ?'
        ).get(adventureId);
        return row && row.max_turn ? row.max_turn : 0;
    }

    // Resolve the turn_index to write: an explicit narration turn wins; an
    // absent one falls back to the current max event turn (0 before any
    // extraction — equivalent to the NULL marker for rollback, since no
    // rollback threshold N >= 1 ever matches it).
    _resolveTurnIndex(adventureId, turnIndex) {
        if (turnIndex === null || turnIndex === undefined) {
            return this.getMaxEventTurnIndex(adventureId);
        }
        return turnIndex;
    }

    insertOffer(adventureId, traderName, requiredItem, offeredItem, description = null, turnIndex = null) {
        const id = `${adventureId}:${traderName.toLowerCase().replace(/\s+/g, '_')}:${requiredItem.toLowerCase().replace(/\s+/g, '_')}`;
        this.db.prepare(`
            INSERT INTO barter_offers (id, adventure_id, trader_name, required_item, offered_item, description, turn_index)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                offered_item = excluded.offered_item,
                description = COALESCE(excluded.description, description),
                turn_index = excluded.turn_index
        `).run(
            id,
            adventureId,
            traderName,
            requiredItem,
            offeredItem,
            description || null,
            this._resolveTurnIndex(adventureId, turnIndex)
        );
        return this.db.prepare('SELECT * FROM barter_offers WHERE id = ?').get(id);
    }

    getOffersForTrader(adventureId, traderName) {
        return this.db.prepare(
            'SELECT * FROM barter_offers WHERE adventure_id = ? AND LOWER(trader_name) = LOWER(?)'
        ).all(adventureId, traderName);
    }

    getAllOffers(adventureId) {
        return this.db.prepare(
            'SELECT * FROM barter_offers WHERE adventure_id = ?'
        ).all(adventureId);
    }

    createQuestGoal(adventureId, npcName, goalTitle, requiredItem, rewardItem, status = 'NOT_STARTED', turnIndex = null) {
        const id = uuidv4().substring(0, 8);
        const createdTurn = this.getMaxEventTurnIndex(adventureId);
        this.db.prepare(`
            INSERT INTO quest_goals (id, adventure_id, npc_name, goal_title, required_item, reward_item, status, created_turn, turn_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            adventureId,
            npcName,
            goalTitle,
            requiredItem,
            rewardItem,
            status,
            createdTurn,
            this._resolveTurnIndex(adventureId, turnIndex)
        );
        return this.getGoalById(adventureId, id);
    }

    getGoalById(adventureId, goalId) {
        return this.db.prepare(
            'SELECT * FROM quest_goals WHERE id = ? AND adventure_id = ?'
        ).get(goalId, adventureId);
    }

    getActiveGoals(adventureId) {
        return this.db.prepare(
            "SELECT * FROM quest_goals WHERE adventure_id = ? AND status NOT IN ('COMPLETED', 'FAILED')"
        ).all(adventureId);
    }

    getAllGoals(adventureId) {
        return this.db.prepare(
            'SELECT * FROM quest_goals WHERE adventure_id = ? ORDER BY created_turn DESC'
        ).all(adventureId);
    }

    acceptQuestGoal(adventureId, goalId) {
        this.db.prepare(
            "UPDATE quest_goals SET status = 'IN_PROGRESS' WHERE id = ? AND adventure_id = ?"
        ).run(goalId, adventureId);
        return this.getGoalById(adventureId, goalId);
    }

    failQuestGoal(adventureId, goalId) {
        this.db.prepare(
            "UPDATE quest_goals SET status = 'FAILED' WHERE id = ? AND adventure_id = ?"
        ).run(goalId, adventureId);
        return this.getGoalById(adventureId, goalId);
    }

    completeQuestGoal(adventureId, goalId) {
        const completedTurn = this.getMaxEventTurnIndex(adventureId);
        this.db.prepare(`
            UPDATE quest_goals SET status = 'COMPLETED', completed_turn = ? WHERE id = ? AND adventure_id = ?
        `).run(completedTurn, goalId, adventureId);
        return this.getGoalById(adventureId, goalId);
    }

    // Dedup anchor for narrated goals: one goal per (npc_name, goal_title).
    findGoalByNpcAndTitle(adventureId, npcName, goalTitle) {
        return this.db.prepare(
            'SELECT id FROM quest_goals WHERE adventure_id = ? AND LOWER(npc_name) = LOWER(?) AND LOWER(goal_title) = LOWER(?)'
        ).get(adventureId, npcName, goalTitle);
    }

    // ─── Room graph (spatial-map-region-graph) ──────────────────────────────

    // Deterministic edge id reflecting the UNIQUE(adventure_id, from_room,
    // direction) constraint: one edge per direction per room. A null-direction
    // one-way edge keys on the target so several one-way connections from the
    // same room coexist (SQLite treats NULLs as distinct in the UNIQUE index).
    _roomEdgeId(adventureId, fromRoom, direction, toRoom = '') {
        return direction
            ? `${adventureId}:${fromRoom}:${direction}`
            : `${adventureId}:${fromRoom}:${toRoom}:oneway`;
    }

    /**
     * Insert or refresh a room node. Returns the row.
     *
     * @param {string} adventureId
     * @param {string} roomId - opaque engine-assigned id (distinct from the name)
     * @param {string} name - canonical display name
     * @param {string|null} description
     * @param {number} firstTurn - discovery turn (0 = hand-created, survives rollback)
     */
    upsertRoom(adventureId, roomId, name, description = null, firstTurn = 0) {
        this.db.prepare(`
            INSERT INTO rooms (id, adventure_id, name, description, first_turn)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = COALESCE(excluded.description, description)
        `).run(roomId, adventureId, name, description, firstTurn);
        return this.getRoom(adventureId, roomId);
    }

    getRoom(adventureId, roomId) {
        return this.db.prepare(
            'SELECT * FROM rooms WHERE id = ? AND adventure_id = ?'
        ).get(roomId, adventureId) || null;
    }

    getRooms(adventureId) {
        return this.db.prepare(
            'SELECT * FROM rooms WHERE adventure_id = ? ORDER BY first_turn, name'
        ).all(adventureId);
    }

    // Name → node lookup (the load-bearing `resolve` of the reconciliation
    // table). Exact indexed SQL match first, then canonical/stem fallback over
    // the adventure's rooms so drifted spellings resolve to the same node.
    findRoomByName(adventureId, name) {
        const exact = this.db.prepare(
            'SELECT * FROM rooms WHERE adventure_id = ? AND LOWER(name) = LOWER(?)'
        ).get(adventureId, name);
        if (exact) return exact;
        const all = this.getRooms(adventureId);
        return all.find(r => roomNamesMatch(r.name, name)) || null;
    }

    /**
     * Record a visit to a room on a turn: bump the room's summary columns and
     * append the per-turn trail row (the undo re-anchor source, D5).
     */
    recordVisit(adventureId, roomId, turn) {
        this.db.prepare(`
            UPDATE rooms SET last_visit_turn = ?, visit_count = visit_count + 1
            WHERE id = ? AND adventure_id = ?
        `).run(turn, roomId, adventureId);
        this.db.prepare(`
            INSERT OR IGNORE INTO room_visits (id, adventure_id, room_id, turn)
            VALUES (?, ?, ?, ?)
        `).run(`${adventureId}:${roomId}:${turn}`, adventureId, roomId, turn);
    }

    /**
     * Record (or refresh) an edge. `turn` is the discovered_turn stamp (NULL
     * for hand-created edges, which survive rollback). Re-recording the same
     * (from, direction) upserts in place via the deterministic id.
     */
    recordEdge(adventureId, fromRoom, direction, toRoom, kind = 'walk', inferred = 0, turn = null) {
        const id = this._roomEdgeId(adventureId, fromRoom, direction, toRoom);
        this.db.prepare(`
            INSERT INTO exits (id, adventure_id, from_room, direction, to_room, kind, inferred, discovered_turn)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                to_room = excluded.to_room,
                kind = excluded.kind,
                inferred = excluded.inferred,
                discovered_turn = COALESCE(excluded.discovered_turn, discovered_turn)
        `).run(id, adventureId, fromRoom, direction, toRoom, kind, inferred, turn);
        return this.getEdge(adventureId, fromRoom, direction);
    }

    getEdge(adventureId, fromRoom, direction) {
        if (direction === null || direction === undefined) {
            return this.db.prepare(
                'SELECT * FROM exits WHERE adventure_id = ? AND from_room = ? AND direction IS NULL'
            ).get(adventureId, fromRoom) || null;
        }
        return this.db.prepare(
            'SELECT * FROM exits WHERE adventure_id = ? AND from_room = ? AND direction = ?'
        ).get(adventureId, fromRoom, direction) || null;
    }

    retractEdge(adventureId, fromRoom, direction) {
        if (direction === null || direction === undefined) {
            return this.db.prepare(
                'DELETE FROM exits WHERE adventure_id = ? AND from_room = ? AND direction IS NULL'
            ).run(adventureId, fromRoom);
        }
        return this.db.prepare(
            'DELETE FROM exits WHERE adventure_id = ? AND from_room = ? AND direction = ?'
        ).run(adventureId, fromRoom, direction);
    }

    getExits(adventureId, roomId) {
        return this.db.prepare(
            'SELECT * FROM exits WHERE adventure_id = ? AND from_room = ? ORDER BY direction'
        ).all(adventureId, roomId);
    }

    getIncomingExits(adventureId, roomId) {
        return this.db.prepare(
            'SELECT * FROM exits WHERE adventure_id = ? AND to_room = ? ORDER BY direction'
        ).all(adventureId, roomId);
    }

    getEdges(adventureId) {
        return this.db.prepare(
            'SELECT * FROM exits WHERE adventure_id = ?'
        ).all(adventureId);
    }

    getInferredEdges(adventureId) {
        return this.db.prepare(
            'SELECT * FROM exits WHERE adventure_id = ? AND inferred = 1'
        ).all(adventureId);
    }

    // Last visit row for a room (room-detail inspection: "last visit turn").
    getLastVisit(adventureId, roomId) {
        return this.db.prepare(
            'SELECT * FROM room_visits WHERE adventure_id = ? AND room_id = ? ORDER BY turn DESC LIMIT 1'
        ).get(adventureId, roomId) || null;
    }

    // Last visit at or before a turn — the undo re-anchor lookup (D5): the
    // pre-turn room is the last visit at or before preUndoMoves - 1.
    getLastVisitAtOrBefore(adventureId, turn) {
        return this.db.prepare(
            'SELECT * FROM room_visits WHERE adventure_id = ? AND turn <= ? ORDER BY turn DESC LIMIT 1'
        ).get(adventureId, turn) || null;
    }

    // ─── Transactional rollback ───────────────────────────────────────────────

    /**
     * Roll back a reverted turn in a single SQLite transaction:
     * remove rows whose turn is >= turnIndex across the full surface a turn can
     * write — events, inventory, lore, barter_offers, quest_goals — rewind the
     * extraction watermark to turnIndex-1 (never advancing it), and return the
     * ids of the removed event rows so the caller can delete their vectors.
     *
     * Offers/goals/lore are deleted with `turn_index >= ? AND turn_index IS
     * NOT NULL` (memory-schema-boundary): narration-created rows carry their
     * batch turn and roll back with it; rows with no narration turn (NULL, or 0
     * for rows created before any extraction) survive.
     *
     * @returns {string[]} ids of removed event rows
     */
    rollbackTurn(adventureId, turnIndex) {
        return this.db.transaction(() => {
            const eventIds = this.db.prepare(
                'SELECT id FROM events WHERE adventure_id = ? AND turn_index >= ?'
            ).all(adventureId, turnIndex).map(r => r.id);

            this.db.prepare(
                'DELETE FROM events WHERE adventure_id = ? AND turn_index >= ?'
            ).run(adventureId, turnIndex);

            this.db.prepare(
                'DELETE FROM inventory WHERE adventure_id = ? AND acquired_turn >= ?'
            ).run(adventureId, turnIndex);

            this.db.prepare(
                'DELETE FROM lore WHERE adventure_id = ? AND turn_index >= ? AND turn_index IS NOT NULL'
            ).run(adventureId, turnIndex);

            this.db.prepare(
                'DELETE FROM barter_offers WHERE adventure_id = ? AND turn_index >= ? AND turn_index IS NOT NULL'
            ).run(adventureId, turnIndex);

            this.db.prepare(
                'DELETE FROM quest_goals WHERE adventure_id = ? AND turn_index >= ? AND turn_index IS NOT NULL'
            ).run(adventureId, turnIndex);

            // Spatial rollback (spatial-map-region-graph, D1/D5): rooms carry
            // first_turn (0 for hand-created/legacy rooms — survives), exits
            // carry discovered_turn with the IS NOT NULL guard so hand-created
            // edges survive, and room_visits roll back by turn. The summary
            // columns (visit_count / last_visit_turn) are recomputed from the
            // surviving trail so a rolled-back visit cannot leave a stale count.
            this.db.prepare(
                'DELETE FROM rooms WHERE adventure_id = ? AND first_turn >= ?'
            ).run(adventureId, turnIndex);

            this.db.prepare(
                'DELETE FROM exits WHERE adventure_id = ? AND discovered_turn >= ? AND discovered_turn IS NOT NULL'
            ).run(adventureId, turnIndex);

            this.db.prepare(
                'DELETE FROM room_visits WHERE adventure_id = ? AND turn >= ?'
            ).run(adventureId, turnIndex);

            this.db.prepare(`
                UPDATE rooms SET
                    visit_count = COALESCE((
                        SELECT COUNT(*) FROM room_visits
                        WHERE room_visits.room_id = rooms.id AND room_visits.adventure_id = rooms.adventure_id
                    ), 0),
                    last_visit_turn = COALESCE((
                        SELECT MAX(turn) FROM room_visits
                        WHERE room_visits.room_id = rooms.id AND room_visits.adventure_id = rooms.adventure_id
                    ), first_turn)
                WHERE adventure_id = ?
            `).run(adventureId);

            const current = this.getLastExtractedTurnIndex(adventureId);
            const rewinded = Math.min(current, Math.max(0, turnIndex - 1));
            this.setLastExtractedTurnIndex(adventureId, rewinded);

            return eventIds;
        })();
    }

    // ─── Stats ────────────────────────────────────────────────────────────────

    getStats(adventureId) {
        return {
            events: this.getEventCount(adventureId),
            inventory: this.db.prepare(
                "SELECT COUNT(*) as count FROM inventory WHERE adventure_id = ? AND status NOT IN ('dropped','destroyed','used','traded')"
            ).get(adventureId)?.count || 0,
            lore: this.db.prepare(
                'SELECT COUNT(*) as count FROM lore WHERE adventure_id = ?'
            ).get(adventureId)?.count || 0,
            lastExtractedTurnIndex: this.getLastExtractedTurnIndex(adventureId)
        };
    }

    deleteAdventureData(adventureId) {
        this.db.prepare('DELETE FROM events WHERE adventure_id = ?').run(adventureId);
        this.db.prepare('DELETE FROM inventory WHERE adventure_id = ?').run(adventureId);
        this.db.prepare('DELETE FROM lore WHERE adventure_id = ?').run(adventureId);
        this.db.prepare('DELETE FROM extraction_state WHERE adventure_id = ?').run(adventureId);
        this.db.prepare('DELETE FROM barter_offers WHERE adventure_id = ?').run(adventureId);
        this.db.prepare('DELETE FROM quest_goals WHERE adventure_id = ?').run(adventureId);
        this.db.prepare('DELETE FROM rooms WHERE adventure_id = ?').run(adventureId);
        this.db.prepare('DELETE FROM exits WHERE adventure_id = ?').run(adventureId);
        this.db.prepare('DELETE FROM room_visits WHERE adventure_id = ?').run(adventureId);
    }

    close() {
        this.db.close();
    }
}
