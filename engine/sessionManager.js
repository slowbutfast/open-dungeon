// Per-request engine lifecycle + KV state/SQLite synchronization
// (vercel-deployment-and-auth, tasks 4.3, 4.4).
//
// Engines are never constructed at import time. Under Vercel every request
// rehydrates `engine.state` from `user:state:<sub>` and mounts the SQLite
// snapshot from `user:db:<sub>`; at request end the same keys are written
// back. Outside serverless a process-local cache preserves the single-user
// local workflow.
import fs from 'fs';
import path from 'path';

let AdventureEngineClass = null;

export async function getAdventureEngineClass() {
    if (!AdventureEngineClass) {
        const mod = await import('./index.js');
        AdventureEngineClass = mod.AdventureEngine;
    }
    return AdventureEngineClass;
}

export async function defaultEngineFactory(saveDir) {
    const Engine = await getAdventureEngineClass();
    return new Engine(saveDir);
}

export const STATE_KEY_PREFIX = 'user:state:';
export const DB_KEY_PREFIX = 'user:db:';

export function stateKey(sub) {
    return `${STATE_KEY_PREFIX}${sub}`;
}

export function dbKey(sub) {
    return `${DB_KEY_PREFIX}${sub}`;
}

function sanitizeSub(sub) {
    return String(sub).replace(/[^A-Za-z0-9._-]/g, '_');
}

export class SessionManager {
    constructor({
        kv = null,
        serverless = process.env.VERCEL === '1',
        tmpRoot = process.env.OD_TMP_ROOT || '/tmp/open-dungeon',
        engineFactory = defaultEngineFactory
    } = {}) {
        this.kv = kv;
        this.serverless = serverless;
        this.tmpRoot = tmpRoot;
        this.engineFactory = engineFactory;
        this.cache = new Map();
    }

    userDir(sub) {
        return path.join(this.tmpRoot, sanitizeSub(sub));
    }

    saveDir(sub) {
        return path.join(this.userDir(sub), 'adventures');
    }

    dataDir(sub) {
        return path.join(this.userDir(sub), 'data');
    }

    async getEngine(sub) {
        if (this.serverless) {
            return this._rehydrate(sub);
        }
        if (!this.cache.has(sub)) {
            this.cache.set(sub, await this.engineFactory(this.saveDir(sub)));
        }
        return this.cache.get(sub);
    }

    /** Replace a user's engine with a fresh instance (used by /api/init). */
    async resetEngine(sub) {
        this.cache.delete(sub);
        if (this.serverless) {
            return await this.engineFactory(this.saveDir(sub));
        }
        const engine = await this.engineFactory(this.saveDir(sub));
        this.cache.set(sub, engine);
        return engine;
    }

    async _rehydrate(sub) {
        let stateData = null;
        let dbBase64 = null;
        if (this.kv) {
            stateData = await this.kv.get(stateKey(sub));
            dbBase64 = await this.kv.get(dbKey(sub));
        }

        if (dbBase64) {
            const dataDir = this.dataDir(sub);
            fs.mkdirSync(dataDir, { recursive: true });
            // A warm container may still hold -wal/-shm companions left by a
            // previous request's SQLite connection. The snapshot we mount is
            // already fully checkpointed, so replaying a stale WAL against it
            // is at best redundant and at worst corrupting. Purge them before
            // the engine opens the database.
            for (const companion of ['memory.db-wal', 'memory.db-shm']) {
                try {
                    fs.rmSync(path.join(dataDir, companion), { force: true });
                } catch {
                    // Best-effort cleanup: a failed unlink must not fail the request.
                }
            }
            fs.writeFileSync(path.join(dataDir, 'memory.db'), Buffer.from(dbBase64, 'base64'));
        }

        const engine = await this.engineFactory(this.saveDir(sub));

        if (stateData) {
            try {
                const parsed = JSON.parse(stateData);
                if (engine.state && typeof engine.state.fromJSON === 'function') {
                    engine.state.fromJSON(parsed);
                }
            } catch {
                // Corrupt state snapshot: start from a clean engine rather
                // than failing the request.
            }
        }
        return engine;
    }

    /** Commit the active adventure state and SQLite snapshot back to KV. */
    async persist(sub, engine) {
        if (!this.kv || !engine) return;
        if (engine.state && typeof engine.state.toJSON === 'function') {
            await this.kv.set(stateKey(sub), JSON.stringify(engine.state.toJSON()));
        }

        const store = engine.memory && engine.memory.structuredStore;
        if (store && store.db) {
            try {
                store.db.pragma('wal_checkpoint(TRUNCATE)');
            } catch {
                // Non-fatal: serialize whatever the main db file holds.
            }
            const buffer = store.db.serialize();
            await this.kv.set(dbKey(sub), buffer.toString('base64'));
        }
    }
}

/**
 * Attach an async `req.getEngine()` resolver. Nothing is constructed until a
 * route actually asks for the engine, so cheap routes (ping, static) and
 * rejected (401/402) requests never touch SQLite or KV.
 */
export function createSessionEngineMiddleware(manager) {
    return (req, res, next) => {
        req.getEngine = async () => {
            if (req._enginePromise) return req._enginePromise;
            if (!req.user) {
                const err = new Error('Unauthorized');
                err.status = 401;
                throw err;
            }
            req._enginePromise = (async () => {
                const engine = await manager.getEngine(req.user.sub);
                if (manager.serverless) {
                    // `finish` and `close` both fire on a completed response;
                    // commit once so a turn is not persisted to KV twice.
                    let committed = false;
                    const commit = () => {
                        if (committed) return;
                        committed = true;
                        manager.persist(req.user.sub, engine).catch(() => {});
                    };
                    res.on('finish', commit);
                    res.on('close', commit);
                }
                return engine;
            })();
            return req._enginePromise;
        };
        next();
    };
}

/** Resolve and attach the request engine to `req.engine`. */
export function resolveEngine(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.getEngine()
        .then((engine) => {
            req.engine = engine;
            next();
        })
        .catch(next);
}

export function createSessionManager(options) {
    return new SessionManager(options);
}

// Process-local default. Constructing it performs no engine/disk work.
export const sessionManager = new SessionManager();
