import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import gameRouter from './routes/game.js';
import savesRouter from './routes/saves.js';
import loreRouter from './routes/lore.js';
import memoryRouter from './routes/memory.js';
import authRouter from './routes/auth.js';
import userRouter from './routes/user.js';

import { config } from './config.js';
import { spendLedger, kvStore } from './kvStore.js';
import { createAttachUserMiddleware } from './middleware/auth.js';
import { createSessionEngineMiddleware, sessionManager } from '../engine/sessionManager.js';

// Load environmental variables
dotenv.config();

// Setup dirname/filename for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local development defaults to the mock LLM. On Vercel, mock mode is a
// fail-closed boot error and is never injected here.
if (process.env.MOCK_LLM === undefined && process.env.VERCEL !== '1') {
    process.env.MOCK_LLM = "1";
}

/**
 * Build the Express application. Dependencies are injectable so tests can swap
 * the ledger/KV/session manager without touching module singletons.
 */
export function createApp(overrides = {}) {
    const cfg = overrides.config || config;
    const app = express();

    app.locals.config = cfg;
    app.locals.ledger = overrides.ledger || spendLedger;
    app.locals.kv = overrides.kv || kvStore;
    app.locals.sessionManager = overrides.sessionManager || sessionManager;

    app.use(cors());
    app.use(express.json());

    // Identity first, then the (lazy) per-request engine resolver.
    app.use(createAttachUserMiddleware(cfg));
    app.use('/api', createSessionEngineMiddleware(app.locals.sessionManager));

    // Serve static assets
    app.use('/static', express.static(path.join(__dirname, 'static')));

    // Serve playgrounds
    app.use('/playgrounds', express.static(path.join(__dirname, '..', 'playgrounds')));

    // Serve main page
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'templates', 'index.html'));
    });

    // Mount modular API routers
    app.use('/api', authRouter);
    app.use('/api', userRouter);
    app.use('/api', gameRouter);
    app.use('/api', savesRouter);
    app.use('/api', loreRouter);
    app.use('/api', memoryRouter);

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        const status = err && err.status ? err.status : 500;
        if (res.headersSent) return res.end();
        res.status(status).json({ error: err && err.message ? err.message : 'Internal server error' });
    });

    return app;
}

const app = createApp();

export default app;

/** Boot the long-lived local server (never invoked on Vercel). */
function startServer() {
    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5001;
    const host = process.env.HOST || "::";

    app.listen(PORT, host, async () => {
        console.log(`Express server running on http://${host}:${PORT}`);

        const backend = process.env.LLM_BACKEND === "openrouter" ? "openrouter" : "lmstudio";

        if (process.env.MOCK_LLM === "1") {
            console.log(`[STARTUP] Using mock LLM. Skipping model preloading.`);
        } else if (backend === "openrouter") {
            console.log(`[STARTUP] Using OpenRouter backend. Model: ${process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash"}`);
            console.log(`[STARTUP] Reasoning effort: ${process.env.REASONING_EFFORT || "low"}`);
            console.log(`[STARTUP] Embedding model: ${process.env.OPENROUTER_EMBEDDING_MODEL || "nvidia/llama-nemotron-embed-vl-1b-v2:free"}`);
            console.log(`[STARTUP] Token range: ${process.env.MAX_TOKENS_RANGE || "50:300"}`);
        } else {
            console.log(`[STARTUP] Using LM Studio backend. Preloading models...`);
            try {
                const hostIP = process.env.LM_STUDIO_HOST || "127.0.0.1";
                const portNum = process.env.LM_STUDIO_PORT || "1234";
                const apiModelsUrl = `http://${hostIP}:${portNum}/api/v1/models`;

                console.log(`[STARTUP] Fetching available models from LM Studio...`);
                const resp = await fetch(apiModelsUrl);
                if (resp.ok) {
                    const data = await resp.json();
                    const models = data.models || [];

                    let llmModelFound = false;
                    for (const m of models) {
                        if (m.type !== "embedding" && m.loaded_instances && m.loaded_instances.length > 0) {
                            console.log(`[STARTUP] LLM model '${m.key}' is already loaded. Skipping load.`);
                            llmModelFound = true;
                            break;
                        }
                    }
                    if (!llmModelFound) {
                        console.log(`[STARTUP] No LLM model found preloaded.`);
                    }

                    let alreadyLoaded = false;
                    for (const m of models) {
                        if (m.type === "embedding" && m.loaded_instances && m.loaded_instances.length > 0) {
                            console.log(`[STARTUP] Embedding model '${m.key}' is already loaded. Skipping load.`);
                            alreadyLoaded = true;
                            break;
                        }
                    }

                    if (!alreadyLoaded) {
                        let modelToLoad = null;
                        for (const m of models) {
                            if (m.type === "embedding") {
                                modelToLoad = m.key;
                                break;
                            }
                        }

                        if (modelToLoad) {
                            console.log(`[STARTUP] Preloading embedding model '${modelToLoad}' via REST API...`);
                            const apiLoadUrl = `http://${hostIP}:${portNum}/api/v1/models/load`;
                            const loadResp = await fetch(apiLoadUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ model: modelToLoad })
                            });

                            if (loadResp.ok) {
                                console.log(`[STARTUP] Embedding model preloaded successfully.`);
                            } else {
                                const errorMsg = await loadResp.text();
                                console.error(`[STARTUP] Failed to preload embedding model via REST API. Status: ${loadResp.status}, Error: ${errorMsg}`);
                            }
                        } else {
                            console.warn(`[STARTUP] No embedding model found in LM Studio list to preload.`);
                        }
                    }
                } else {
                    console.warn(`[STARTUP] Failed to query LM Studio models list. Status: ${resp.status}`);
                }
            } catch (e) {
                console.error(`[STARTUP] Error preloading embedding model:`, e.message);
            }
        }
    });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun && process.env.VERCEL !== '1') {
    startServer();
}
