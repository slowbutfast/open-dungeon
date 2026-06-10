import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import gameRouter from './routes/game.js';
import savesRouter from './routes/saves.js';
import loreRouter from './routes/lore.js';

// Load environmental variables
dotenv.config();

// Setup dirname/filename for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set mock environment variable if running locally for tests
if (process.env.MOCK_LLM === undefined) {
    process.env.MOCK_LLM = "1";
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve static assets
app.use('/static', express.static(path.join(__dirname, 'static')));

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Mount modular API routers
app.use('/api', gameRouter);
app.use('/api', savesRouter);
app.use('/api', loreRouter);

const PORT = 5001;
// Bind to 127.0.0.1 in mock mode to avoid firewall popup and socket lookup delay
const host = process.env.MOCK_LLM === "1" ? "127.0.0.1" : "0.0.0.0";

app.listen(PORT, host, () => {
    console.log(`Express server running on http://${host}:${PORT}`);
});
