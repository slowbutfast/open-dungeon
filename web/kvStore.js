// Durable Vercel KV / Upstash Redis client + spend ledger
// (vercel-deployment-and-auth, tasks 3.2, 3.3, 3.4).
//
// The Upstash REST protocol is a JSON command array posted to the database
// URL, so no extra npm dependency is needed. When credentials are absent the
// store degrades to a process-local in-memory implementation for development.

export const USER_SPEND_LIMIT_USD = 2.50;
export const GLOBAL_SPEND_LIMIT_USD = 50.00;
export const GLOBAL_SPEND_KEY = 'global:spend:total';

export function userSpendKey(sub) {
    return `user:spend:${sub}`;
}

export function lockKey(sub) {
    return `user:lock:${sub}`;
}

/**
 * Minimal Redis-shaped KV client. Configured with `url`/`token` it speaks the
 * Upstash REST protocol; otherwise every command is served from process
 * memory (dev fallback, per the spend-quota spec).
 */
export class KvStore {
    constructor({ url = null, token = null, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
        this.url = url;
        this.token = token;
        this.fetchImpl = fetchImpl;
        this._now = now;
        this._strings = new Map(); // key -> { value, expiresAt }
        this._hashes = new Map();  // key -> Map(field -> number)
        this.isMemory = !(url && token);
    }

    async _command(args) {
        const res = await this.fetchImpl(this.url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(args)
        });
        if (!res.ok) {
            throw new Error(`KV command failed (${res.status})`);
        }
        const data = await res.json();
        if (data && data.error) throw new Error(`KV command error: ${data.error}`);
        return data ? data.result : null;
    }

    _liveString(key) {
        const entry = this._strings.get(key);
        if (!entry) return null;
        if (entry.expiresAt !== null && this._now() >= entry.expiresAt) {
            this._strings.delete(key);
            return null;
        }
        return entry;
    }

    async get(key) {
        if (this.isMemory) {
            const entry = this._liveString(key);
            return entry ? entry.value : null;
        }
        const result = await this._command(['GET', key]);
        return result === undefined ? null : result;
    }

    /** SET with optional NX and EX. Returns true when the value was written. */
    async set(key, value, { nx = false, ex = null } = {}) {
        if (this.isMemory) {
            const existing = this._liveString(key);
            if (nx && existing) return false;
            this._strings.set(key, {
                value: String(value),
                expiresAt: ex ? this._now() + ex * 1000 : null
            });
            return true;
        }
        const args = ['SET', key, String(value)];
        if (nx) args.push('NX');
        if (ex) args.push('EX', String(ex));
        const result = await this._command(args);
        return result === 'OK';
    }

    async del(key) {
        if (this.isMemory) {
            const hadString = this._strings.delete(key);
            const hadHash = this._hashes.delete(key);
            return (hadString || hadHash) ? 1 : 0;
        }
        return this._command(['DEL', key]);
    }

    async hget(key, field) {
        if (this.isMemory) {
            const hash = this._hashes.get(key);
            if (!hash || !hash.has(field)) return null;
            return String(hash.get(field));
        }
        const result = await this._command(['HGET', key, field]);
        return result === undefined ? null : result;
    }

    async hincrbyfloat(key, field, amount) {
        if (this.isMemory) {
            let hash = this._hashes.get(key);
            if (!hash) {
                hash = new Map();
                this._hashes.set(key, hash);
            }
            const next = (Number(hash.get(field)) || 0) + Number(amount);
            hash.set(field, next);
            return next;
        }
        const result = await this._command(['HINCRBYFLOAT', key, field, String(amount)]);
        return Number(result);
    }

    async incrbyfloat(key, amount) {
        if (this.isMemory) {
            const entry = this._liveString(key);
            const next = (entry ? Number(entry.value) : 0) + Number(amount);
            this._strings.set(key, { value: String(next), expiresAt: entry ? entry.expiresAt : null });
            return next;
        }
        const result = await this._command(['INCRBYFLOAT', key, String(amount)]);
        return Number(result);
    }
}

/** Build a KV client from the environment, falling back to memory. */
export function createKvStore(env = process.env) {
    const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || null;
    const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || null;
    return new KvStore({ url, token });
}

// Process-local default used by the middleware when nothing is injected.
export const kvStore = createKvStore(process.env);

const round = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Authoritative lifetime spend ledger backed by a KV store. Per-user spend
 * lives in the hash `user:spend:<sub>` field `total` (atomic HINCRBYFLOAT);
 * aggregate project spend lives at `global:spend:total`.
 */
export class SpendLedger {
    constructor(kv, { userLimit = USER_SPEND_LIMIT_USD, globalLimit = GLOBAL_SPEND_LIMIT_USD } = {}) {
        if (!kv) throw new Error('SpendLedger requires a KV store');
        this.kv = kv;
        this.userLimit = userLimit;
        this.globalLimit = globalLimit;
    }

    async getSpend(sub) {
        const value = await this.kv.hget(userSpendKey(sub), 'total');
        return value === null || value === undefined ? 0 : Number(value) || 0;
    }

    async recordSpend(sub, amount) {
        const total = await this.kv.hincrbyfloat(userSpendKey(sub), 'total', amount);
        await this.kv.incrbyfloat(GLOBAL_SPEND_KEY, amount);
        return Number(total) || 0;
    }

    async getGlobalSpend() {
        const value = await this.kv.get(GLOBAL_SPEND_KEY);
        return value === null || value === undefined ? 0 : Number(value) || 0;
    }

    async getRemaining(sub) {
        return round(Math.max(0, this.userLimit - (await this.getSpend(sub))));
    }

    async isGlobalExceeded() {
        return (await this.getGlobalSpend()) >= this.globalLimit;
    }

    async canSpend(sub) {
        if (await this.isGlobalExceeded()) return false;
        return (await this.getSpend(sub)) < this.userLimit;
    }
}

export const spendLedger = new SpendLedger(kvStore, {
    userLimit: parseFloat(process.env.USER_SPEND_LIMIT_USD || String(USER_SPEND_LIMIT_USD)),
    globalLimit: parseFloat(process.env.GLOBAL_SPEND_LIMIT_USD || String(GLOBAL_SPEND_LIMIT_USD))
});

// ─── in-flight turn locking ────────────────────────────────────────────────

/** Atomic SET NX EX. Returns true when this caller holds the lock. */
export async function acquireLock(kv, key, ttlSeconds = 30) {
    return kv.set(key, '1', { nx: true, ex: ttlSeconds });
}

export async function releaseLock(kv, key) {
    return kv.del(key);
}
