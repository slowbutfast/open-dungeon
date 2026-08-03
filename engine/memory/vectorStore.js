import { LocalIndex } from 'vectra';
import path from 'path';
import fs from 'fs';

/**
 * VectorStore — wraps vectra's LocalIndex for per-adventure semantic memory.
 * Stores are persisted as flat JSON files under dataDir/indexes/{adventureId}/.
 * No server process required.
 */
export class VectorStore {
    constructor(dataDir, dimensions = 768) {
        this.indexDir = path.join(dataDir, 'indexes');
        fs.mkdirSync(this.indexDir, { recursive: true });
        this._indexes = new Map(); // adventureId → LocalIndex
        this.dimensions = dimensions;
    }

    async _getIndex(adventureId) {
        if (this._indexes.has(adventureId)) {
            return this._indexes.get(adventureId);
        }
        const indexPath = path.join(this.indexDir, adventureId);
        const idx = new LocalIndex(indexPath);
        if (!await idx.isIndexCreated()) {
            await idx.createIndex(this.dimensions);
        }
        this._indexes.set(adventureId, idx);
        return idx;
    }

    /**
     * Upsert documents. Uses content-hash IDs for deduplication.
     * If an item with the same ID exists, it is replaced.
     */
    async upsertDocuments(adventureId, ids, documents, embeddings, metadatas) {
        const idx = await this._getIndex(adventureId);

        for (let i = 0; i < ids.length; i++) {
            // Check if item already exists by querying with its own vector
            // vectra doesn't have a direct "get by id" in all versions,
            // so we delete then insert to implement upsert.
            try {
                await idx.deleteItem(ids[i]);
            } catch (_) {
                // Item didn't exist — fine
            }
            await idx.insertItem({
                id: ids[i],
                vector: embeddings[i],
                metadata: {
                    ...metadatas[i],
                    document: documents[i]
                }
            });
        }
    }

    /**
     * Query for the top-K most similar documents to the query embedding.
     */
    async query(adventureId, queryEmbedding, topK = 5) {
        const idx = await this._getIndex(adventureId);

        try {
            const stats = await idx.getIndexStats();
            if (stats.items === 0) return [];

            const actualTopK = Math.min(topK, stats.items);
            const results = await idx.queryItems(queryEmbedding, undefined, actualTopK);

            return results.map(r => ({
                id: r.item.id,
                document: r.item.metadata?.document || '',
                metadata: r.item.metadata || {},
                score: r.score  // cosine similarity score
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Delete documents by their ids (used to remove vector embeddings for
     * rolled-back turns). Ids that do not exist are silently ignored.
     */
    async deleteItems(adventureId, ids) {
        if (!ids || ids.length === 0) return;
        try {
            const idx = await this._getIndex(adventureId);
            await idx.deleteItems(ids);
        } catch (e) {
            // Ignore missing index/items
        }
    }

    /**
     * Returns the number of documents in the index for an adventure.
     */
    async count(adventureId) {
        try {
            const idx = await this._getIndex(adventureId);
            const stats = await idx.getIndexStats();
            return stats.items;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Delete an entire adventure's index (called on adventure delete).
     */
    async deleteIndex(adventureId) {
        try {
            const indexPath = path.join(this.indexDir, adventureId);
            fs.rmSync(indexPath, { recursive: true, force: true });
            this._indexes.delete(adventureId);
        } catch (e) {
            // Ignore
        }
    }
}
