import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { normalizeItemName, itemNamesMatch } from './itemNames.js';

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
                source          TEXT DEFAULT 'auto'
            );
        `);
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

    upsertLore(adventureId, loreId, name, type, description, triggerWords, source = 'auto') {
        this.db.prepare(`
            INSERT INTO lore (id, adventure_id, name, type, description, trigger_words, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                description = COALESCE(excluded.description, description),
                trigger_words = excluded.trigger_words
        `).run(
            loreId,
            adventureId,
            name,
            type,
            description || null,
            JSON.stringify(triggerWords || []),
            source
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

    // ─── Transactional rollback ───────────────────────────────────────────────

    /**
     * Roll back a reverted turn in a single SQLite transaction:
     * remove event + inventory rows whose turn is >= turnIndex, rewind the
     * extraction watermark to turnIndex-1 (never advancing it), and return the
     * ids of the removed event rows so the caller can delete their vectors.
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
    }

    close() {
        this.db.close();
    }
}
