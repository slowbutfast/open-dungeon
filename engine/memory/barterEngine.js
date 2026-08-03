// Barter and quest-goal state machine (memory-schema-boundary, #27).
//
// This is a THIN state machine: all schema and row access for barter_offers /
// quest_goals lives in StructuredStore (the single schema owner). BarterEngine
// adds the trade/goal semantics on top of the store's access methods and never
// reaches into a raw db handle.
import { itemNamesMatch } from './itemNames.js';

export class BarterEngine {
    constructor(structuredStore) {
        this.store = structuredStore;
        this._initSchema();
    }

    // Retained as a no-op: schema ownership moved to StructuredStore. The
    // constructor still calls it so it remains the construction-counting seam
    // for the single-instance unit test (barterEngine.test.mjs).
    _initSchema() {}

    registerOffer(adventureId, traderName, requiredItem, offeredItem, description = null, turnIndex = null) {
        return this.store.insertOffer(adventureId, traderName, requiredItem, offeredItem, description, turnIndex);
    }

    getOffersForTrader(adventureId, traderName) {
        return this.store.getOffersForTrader(adventureId, traderName);
    }

    getAllOffers(adventureId) {
        return this.store.getAllOffers(adventureId);
    }

    executeBarter(adventureId, traderName, requiredItem) {
        // Find the offer, matching the requested item by canonical name so
        // narration ("the Gem", "gem") resolves to the same contract the store holds.
        const offers = this.getOffersForTrader(adventureId, traderName);
        const offer = offers.find(o => itemNamesMatch(o.required_item, requiredItem));

        if (!offer) {
            throw new Error(`No barter offer found for ${requiredItem} from ${traderName}.`);
        }

        // Check if player has the required item (canonical match against held rows)
        const heldItem = this.store.hasItem(adventureId, offer.required_item);
        if (!heldItem) {
            throw new Error(`You don't have ${offer.required_item} to trade.`);
        }

        // Execute the atomic swap using the stored item name so the canonical
        // lookup inside executeTrade succeeds even if the offer spelled it differently
        this.store.executeTrade(adventureId, heldItem.item_name, offer.offered_item, offer.description || null, 'misc');

        return offer;
    }

    createGoal(adventureId, npcName, goalTitle, requiredItem, rewardItem, status = 'NOT_STARTED', turnIndex = null) {
        return this.store.createQuestGoal(adventureId, npcName, goalTitle, requiredItem, rewardItem, status, turnIndex);
    }

    acceptGoal(adventureId, goalId) {
        const goal = this.store.getGoalById(adventureId, goalId);

        if (!goal) {
            throw new Error('Goal not found.');
        }

        if (goal.status !== 'NOT_STARTED') {
            throw new Error('Goal must be in NOT_STARTED state to accept.');
        }

        return this.store.acceptQuestGoal(adventureId, goalId);
    }

    failGoal(adventureId, goalId) {
        const goal = this.store.getGoalById(adventureId, goalId);

        if (!goal) {
            throw new Error('Goal not found.');
        }

        if (goal.status === 'COMPLETED' || goal.status === 'FAILED') {
            throw new Error('Goal cannot be failed from its current state.');
        }

        return this.store.failQuestGoal(adventureId, goalId);
    }

    completeGoal(adventureId, goalId) {
        const goal = this.store.getGoalById(adventureId, goalId);

        if (!goal) {
            throw new Error('Goal not found.');
        }

        if (goal.status === 'COMPLETED') {
            throw new Error('Goal is already completed.');
        }

        if (goal.status === 'FAILED') {
            throw new Error('Goal has failed and cannot be completed.');
        }

        // Check if player has the required item (canonical match via hasItem)
        const hasItem = this.store.hasItem(adventureId, goal.required_item);
        if (!hasItem) {
            throw new Error(`You don't have ${goal.required_item} needed to complete this goal.`);
        }

        // Execute the trade: consume required item, grant reward item
        this.store.executeTrade(adventureId, goal.required_item, goal.reward_item, null, 'misc');

        return this.store.completeQuestGoal(adventureId, goalId);
    }

    getActiveGoals(adventureId) {
        return this.store.getActiveGoals(adventureId);
    }

    getAllGoals(adventureId) {
        return this.store.getAllGoals(adventureId);
    }
}
