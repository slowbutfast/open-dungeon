export class EmbeddingService {
    constructor(client) {
        this.client = client;
        this.loadedEmbeddingModel = null;
    }

    async ensureEmbeddingModelLoaded() {
        if (process.env.MOCK_LLM === "1") {
            this.loadedEmbeddingModel = "mock-embedding-model";
            return "mock-embedding-model";
        }

        if (this.loadedEmbeddingModel) {
            return this.loadedEmbeddingModel;
        }

        try {
            const baseUrlStr = this.client.baseURL;
            if (!baseUrlStr) {
                this.loadedEmbeddingModel = "nomic-embed-text";
                return "nomic-embed-text";
            }
            const parsed = new URL(baseUrlStr);
            const apiBase = `${parsed.protocol}//${parsed.host}`;
            const apiModelsUrl = `${apiBase}/api/v1/models`;

            const resp = await fetch(apiModelsUrl, { signal: AbortSignal.timeout(3000) });
            if (resp.ok) {
                const data = await resp.json();
                const models = data.models || [];

                // 1. Look for a loaded embedding model
                for (const m of models) {
                    if (m.type === "embedding" && m.loaded_instances && m.loaded_instances.length > 0) {
                        this.loadedEmbeddingModel = m.key;
                        return m.key;
                    }
                }

                // 2. Look for any embedding model to load
                let modelToLoad = null;
                for (const m of models) {
                    if (m.type === "embedding") {
                        modelToLoad = m.key;
                        break;
                    }
                }

                if (modelToLoad) {
                    const apiLoadUrl = `${apiBase}/api/v1/models/load`;
                    const loadResp = await fetch(apiLoadUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: modelToLoad
                        }),
                        signal: AbortSignal.timeout(10000)
                    });

                    if (loadResp.ok) {
                        this.loadedEmbeddingModel = modelToLoad;
                        return modelToLoad;
                    } else {
                        const errorMsg = await loadResp.text();
                        console.warn(`Failed to load embedding model '${modelToLoad}' via LM Studio API. Status: ${loadResp.status}, Error: ${errorMsg}`);
                    }
                }
            }
        } catch (e) {
            console.warn("Failed to check or load embedding model via LM Studio API:", e.message);
        }

        // Fallback or default
        this.loadedEmbeddingModel = "nomic-embed-text";
        return "nomic-embed-text";
    }

    async embed(text) {
        if (process.env.MOCK_LLM === "1") {
            return Array(768).fill(0).map((_, i) => Math.sin(i) * 0.1);
        }

        const model = await this.ensureEmbeddingModelLoaded();
        const response = await this.client.embeddings.create({
            model: model,
            input: text
        });
        return response.data[0].embedding;
    }

    async embedBatch(texts) {
        if (texts.length === 0) return [];
        if (process.env.MOCK_LLM === "1") {
            return texts.map((_, idx) => Array(768).fill(0).map((_, i) => Math.sin(idx + i) * 0.1));
        }

        const model = await this.ensureEmbeddingModelLoaded();
        const response = await this.client.embeddings.create({
            model: model,
            input: texts
        });
        const sortedData = [...response.data].sort((a, b) => (a.index || 0) - (b.index || 0));
        return sortedData.map(item => item.embedding);
    }
}
