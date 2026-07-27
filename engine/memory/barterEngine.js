import { v4 as uuidv4 } from 'uuid';

export class BarterEngine {
    constructor(structuredStore) {
        this.store = structuredStore;
        this._initSchema();
    }

    _initSchema() {
        this.store.db.exec(`
            CREATE TABLE IF NOT EXISTS barter_offers (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                trader_name     TEXT NOT NULL,
                required_item   TEXT NOT NULL,
                offered_item    TEXT NOT NULL,
                description     TEXT
            );

            CREATE TABLE IF NOT EXISTS quest_goals (
                id              TEXT PRIMARY KEY,
                adventure_id    TEXT NOT NULL,
                npc_name        TEXT NOT NULL,
                goal_title      TEXT NOT NULL,
                required_item   TEXT NOT NULL,
                reward_item     TEXT NOT NULL,
                status          TEXT DEFAULT 'NOT_STARTED',
                created_turn    INTEGER,
                completed_turn  INTEGER
            );
        `);
    }

    registerOffer(adventureId, traderName, requiredItem, offeredItem, description = null) {
        const id = `${adventureId}:${traderName.toLowerCase().replace(/\s+/g, '_')}:${requiredItem.toLowerCase().replace(/\s+/g, '_')}`;
        this.store.db.prepare(`
            INSERT INTO barter_offers (id, adventure_id, trader_name, required_item, offered_item, description)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                offered_item = excluded.offered_item,
                description = COALESCE(excluded.description, description)
        `).run(id, adventureId, traderName, requiredItem, offeredItem, description || null);
        return this.store.db.prepare('SELECT * FROM barter_offers WHERE id = ?').get(id);
    }

    getOffersForTrader(adventureId, traderName) {
        return this.store.db.prepare(
            'SELECT * FROM barter_offers WHERE adventure_id = ? AND LOWER(trader_name) = LOWER(?)'
        ).all(adventureId, traderName);
    }

    getAllOffers(adventureId) {
        return this.store.db.prepare(
            'SELECT * FROM barter_offers WHERE adventure_id = ?'
        ).all(adventureId);
    }

    executeBarter(adventureId, traderName, requiredItem) {
        // Find the offer
        const offer = this.store.db.prepare(
            'SELECT * FROM barter_offers WHERE adventure_id = ? AND LOWER(trader_name) = LOWER(?) AND LOWER(required_item) = LOWER(?)'
        ).get(adventureId, traderName, requiredItem);

        if (!offer) {
            throw new Error(`No barter offer found for ${requiredItem} from ${traderName}.`);
        }

        // Check if player has the required item
        const hasItem = this.store.hasItem(adventureId, offer.required_item);
        if (!hasItem) {
            throw new Error(`You don't have ${offer.required_item} to trade.`);
        }

        // Execute the atomic swap
        this.store.executeTrade(adventureId, offer.required_item, offer.offered_item, offer.description || null, 'misc');

        return offer;
    }

    createGoal(adventureId, npcName, goalTitle, requiredItem, rewardItem) {
        const id = uuidv4().substring(0, 8);
        this.store.db.prepare(`
            INSERT INTO quest_goals (id, adventure_id, npc_name, goal_title, required_item, reward_item, status, created_turn)
            VALUES (?, ?, ?, ?, ?, ?, 'NOT_STARTED', COALESCE((SELECT MAX(turn_index) FROM events WHERE adventure_id = ?), 0))
        `).run(id, adventureId, npcName, goalTitle, requiredItem, rewardItem, adventureId);
        return this.store.db.prepare('SELECT * FROM quest_goals WHERE id = ?').get(id);
    }

    acceptGoal(adventureId, goalId) {
        const goal = this.store.db.prepare(
            'SELECT * FROM quest_goals WHERE id = ? AND adventure_id = ?'
        ).get(goalId, adventureId);

        if (!goal) {
            throw new Error('Goal not found.');
        }

        if (goal.status !== 'NOT_STARTED') {
            throw new Error('Goal must be in NOT_STARTED state to accept.');
        }

        this.store.db.prepare(
            "UPDATE quest_goals SET status = 'IN_PROGRESS' WHERE id = ?"
        ).run(goalId);

        return this.store.db.prepare('SELECT * FROM quest_goals WHERE id = ?').get(goalId);
    }

    failGoal(adventureId, goalId) {
        const goal = this.store.db.prepare(
            'SELECT * FROM quest_goals WHERE id = ? AND adventure_id = ?'
        ).get(goalId, adventureId);

        if (!goal) {
            throw new Error('Goal not found.');
        }

        if (goal.status === 'COMPLETED' || goal.status === 'FAILED') {
            throw new Error('Goal cannot be failed from its current state.');
        }

        this.store.db.prepare(
            "UPDATE quest_goals SET status = 'FAILED' WHERE id = ?"
        ).run(goalId);

        return this.store.db.prepare('SELECT * FROM quest_goals WHERE id = ?').get(goalId);
    }

    completeGoal(adventureId, goalId) {
        const goal = this.store.db.prepare(
            'SELECT * FROM quest_goals WHERE id = ? AND adventure_id = ?'
        ).get(goalId, adventureId);

        if (!goal) {
            throw new Error('Goal not found.');
        }

        if (goal.status === 'COMPLETED') {
            throw new Error('Goal is already completed.');
        }

        if (goal.status === 'FAILED') {
            throw new Error('Goal has failed and cannot be completed.');
        }

        // Check if player has the required item
        const hasItem = this.store.hasItem(adventureId, goal.required_item);
        if (!hasItem) {
            throw new Error(`You don't have ${goal.required_item} needed to complete this goal.`);
        }

        // Execute the trade: consume required item, grant reward item
        this.store.executeTrade(adventureId, goal.required_item, goal.reward_item, null, 'misc');

        // Update goal status
        this.store.db.prepare(`
            UPDATE quest_goals SET status = 'COMPLETED', completed_turn = COALESCE((SELECT MAX(turn_index) FROM events WHERE adventure_id = ?), 0)
            WHERE id = ?
        `).run(adventureId, goalId);

        return this.store.db.prepare('SELECT * FROM quest_goals WHERE id = ?').get(goalId);
    }

    getActiveGoals(adventureId) {
        return this.store.db.prepare(
            "SELECT * FROM quest_goals WHERE adventure_id = ? AND status NOT IN ('COMPLETED', 'FAILED')"
        ).all(adventureId);
    }

    getAllGoals(adventureId) {
        return this.store.db.prepare(
            'SELECT * FROM quest_goals WHERE adventure_id = ? ORDER BY created_turn DESC'
        ).all(adventureId);
    }
}
