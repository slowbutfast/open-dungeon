import { AdventureEngine } from '../game/engine/index.js';

export let engine = new AdventureEngine();

export function resetEngine() {
    engine = new AdventureEngine();
    return engine;
}
