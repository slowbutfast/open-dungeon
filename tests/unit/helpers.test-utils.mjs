// Shared helpers for the node:test unit seam (architecture-deepening-sequence,
// task group 1 — the unit seam). No new dependencies: node:test, node:assert,
// better-sqlite3 (already a dependency).
//
// The StructuredStore constructor hard-codes a file-backed `memory.db`, so the
// seam is a temp data dir under os.tmpdir() (mirroring the node-probe pattern
// in tests/test_extractor_validation.py) rather than a `:memory:` handle.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MemoryManager } from '../../engine/memory/memoryManager.js';
import { StructuredStore } from '../../engine/memory/structuredStore.js';

export function createTempDir(prefix = 'od-unit-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupDir(dir) {
    if (!dir) return;
    fs.rmSync(dir, { recursive: true, force: true });
}

// Stub embedding service used by the MemoryManager probes. Keeps the flush path
// off any real embedding client while exercising the real SQLite/vector writes.
export const stubEmbeddingService = {
    embedBatch: async (texts) => texts.map(() => Array(768).fill(0)),
    embed: async () => Array(768).fill(0)
};

export function createStructuredStore(dataDir = null) {
    const ownDir = dataDir || createTempDir('od-store-');
    return { store: new StructuredStore(ownDir), dataDir: ownDir };
}

// Instantiates a real MemoryManager over a temp data dir with a stubbed
// llmClient/embeddingService, mirroring the memory-manager probes in
// tests/test_extractor_validation.py.
export function createMemoryManager({ dataDir = null, llmClient = {}, embeddings = stubEmbeddingService } = {}) {
    const ownDir = dataDir || createTempDir('od-mm-');
    const mm = new MemoryManager(ownDir, llmClient, embeddings);
    return { mm, dataDir: ownDir };
}
