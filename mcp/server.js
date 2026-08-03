#!/usr/bin/env node

/**
 * Open Dungeon MCP Server
 *
 * A Model Context Protocol server that exposes the AdventureEngine as
 * 18 tools for AI agents to autonomously playtest and debug the game.
 *
 * Usage:
 *   node mcp/server.js              # stdio transport (default)
 *   node mcp/server.js --transport sse   # SSE transport on port 3100
 *   node mcp/server.js --transport sse --port 8080
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { AdventureEngine } from '../engine/index.js';
import { registerAllTools } from './tools/index.js';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Parse CLI Arguments ────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        transport: 'stdio',
        port: 3100
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--transport' && i + 1 < args.length) {
            config.transport = args[++i];
        } else if (args[i] === '--port' && i + 1 < args.length) {
            config.port = parseInt(args[++i], 10);
        }
    }

    return config;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
    const config = parseArgs();

    // Create a dedicated AdventureEngine instance (separate from the web server's singleton)
    const engine = new AdventureEngine();

    // Surface the resolved save directory so a mis-configured client (e.g. one
    // that drops the .mcp.json env block, dropping SAVE_DIR) is visible at
    // startup instead of silently falling back to the production directory.
    console.error(`[mcp] SAVE_DIR resolved to: ${engine.saveDir} (env SAVE_DIR=${process.env.SAVE_DIR || '(unset)'})`);

    // Guard against the two playtest hazards the tools can hit when launched
    // without the intended env block (see .opencode/opencode.jsonc):
    //   1. SAVE_DIR unset or resolving into the production game/adventures tree.
    //   2. A real LLM backend when the operator expects offline mock.
    // This is a warning, not a hard fail — a human may legitimately target
    // production saves or want a real model.
    const mockLlm = process.env.MOCK_LLM === "1";
    const productionSave = engine.saveDir.includes(path.join('game', 'adventures'));
    if (!process.env.SAVE_DIR || productionSave) {
        console.error(
            '[mcp] WARNING: SAVE_DIR is unset or resolves to the production ' +
            `game/adventures tree (${engine.saveDir}). Playtest sessions will ` +
            'overwrite real save data. Set SAVE_DIR to a sandbox (e.g. ' +
            'game/playtest/adventures) or via .opencode/opencode.jsonc ' +
            'mcp.open-dungeon.environment.'
        );
    }
    if (!mockLlm) {
        console.error(
            '[mcp] WARNING: MOCK_LLM is not "1" — tools will call a real LLM ' +
            'backend and incur API cost. For routine/autonomous playtest loops ' +
            'set MOCK_LLM=1 (see .opencode/opencode.jsonc).'
        );
    }

    // Create the MCP server with server info
    const server = new McpServer({
        name: "open-dungeon-mcp",
        version: "1.0.0"
    }, {
        capabilities: {
            tools: {}
        }
    });

    // Register all 18 tools
    registerAllTools(server, engine);

    if (config.transport === 'sse') {
        await startSSETransport(server, config);
    } else {
        await startStdioTransport(server);
    }
}

// ─── stdio Transport ────────────────────────────────────────────────────

async function startStdioTransport(server) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP server running on stdio');
}

// ─── SSE Transport ──────────────────────────────────────────────────────

/**
 * Manages SSE transport sessions. Each SSE connection gets its own transport instance.
 */
class SSESessionManager {
    constructor(server) {
        this.server = server;
        this.sessions = new Map();
    }

    async handleSSEConnection(req, res, messagePath) {
        // Create a new transport for this SSE session
        const transport = new SSEServerTransport(messagePath, res);
        const sessionId = transport.sessionId;
        this.sessions.set(sessionId, transport);
        res.on('close', () => {
            this.sessions.delete(sessionId);
        });
        await this.server.connect(transport);
    }

    async handlePostMessage(req, res) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const sessionId = url.searchParams.get('sessionId');
        
        if (!sessionId || !this.sessions.has(sessionId)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No active SSE session. Connect to /sse first.' }));
            return;
        }

        const transport = this.sessions.get(sessionId);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const message = JSON.parse(body);
                await transport.handlePostMessage(req, res, message);
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    }
}

async function startSSETransport(server, config) {
    const sessionManager = new SSESessionManager(server);
    const messagePath = '/message';

    const httpServer = http.createServer(async (req, res) => {
        // Health check endpoint
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        // SSE endpoint - client connects here to receive events
        if (req.method === 'GET' && req.url === '/sse') {
            await sessionManager.handleSSEConnection(req, res, messagePath);
            return;
        }

        // Message endpoint - client POSTs JSON-RPC messages here
        if (req.method === 'POST' && req.url && req.url.startsWith(messagePath)) {
            await sessionManager.handlePostMessage(req, res);
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    });

    httpServer.listen(config.port, () => {
        console.error(`MCP server running on SSE transport at http://localhost:${config.port}/sse`);
    });
}

// ─── Startup ────────────────────────────────────────────────────────────

main().catch(error => {
    console.error('Fatal error starting MCP server:', error);
    process.exit(1);
});
