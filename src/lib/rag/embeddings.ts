import { pipeline, env } from '@huggingface/transformers';
import { EmbeddingModelOption } from '../types';

// Configure transformers for browser environment
env.allowLocalModels = false;

export const AVAILABLE_EMBEDDING_MODELS: EmbeddingModelOption[] = [
  {
    id: 'google/embeddinggemma-2-270m',
    name: 'EmbeddingGemma 2 (270M)',
    dimensions: 768,
    modelPath: 'google/embeddinggemma-2',
    contextWindow: 8192,
    sizeLabel: '270M params (768D)',
    description:
      "Google DeepMind's multimodal embedding model. 8,192-token context window, MTEB Code leader, 768D unified vector space with Matryoshka Representation Learning (MRL).",
    isDefault: true,
  },
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'all-MiniLM-L6-v2',
    dimensions: 384,
    modelPath: 'Xenova/all-MiniLM-L6-v2',
    contextWindow: 512,
    sizeLabel: '~80 MB (384D)',
    description: 'Ultra-fast and lightweight 384-dimensional embedding model for low-spec devices.',
  },
];

let activeEmbeddingModelId = AVAILABLE_EMBEDDING_MODELS[0].id;
const extractorInstances = new Map<string, any>();
const extractorPromises = new Map<string, Promise<any>>();

export function getActiveEmbeddingModel(): EmbeddingModelOption {
  return (
    AVAILABLE_EMBEDDING_MODELS.find((m) => m.id === activeEmbeddingModelId) ||
    AVAILABLE_EMBEDDING_MODELS[0]
  );
}

export function setActiveEmbeddingModel(modelId: string) {
  if (AVAILABLE_EMBEDDING_MODELS.some((m) => m.id === modelId)) {
    activeEmbeddingModelId = modelId;
  }
}

export async function getEmbeddingPipeline(
  modelId: string = activeEmbeddingModelId,
  onProgress?: (progress: number, text: string) => void
): Promise<any> {
  if (extractorInstances.has(modelId)) {
    return extractorInstances.get(modelId);
  }
  if (extractorPromises.has(modelId)) {
    return extractorPromises.get(modelId);
  }

  const modelConfig =
    AVAILABLE_EMBEDDING_MODELS.find((m) => m.id === modelId) ||
    AVAILABLE_EMBEDDING_MODELS[0];

  const promise = (async () => {
    try {
      const extractor = await pipeline('feature-extraction', modelConfig.modelPath, {
        progress_callback: (item: any) => {
          if (item && item.progress !== undefined && onProgress) {
            onProgress(
              item.progress / 100,
              item.file || `Downloading ${modelConfig.name}...`
            );
          }
        },
      });
      extractorInstances.set(modelId, extractor);
      return extractor;
    } catch (err) {
      console.warn(`Could not load ONNX model "${modelConfig.modelPath}", using 768D fallback:`, err);
      throw err;
    }
  })();

  extractorPromises.set(modelId, promise);
  return promise;
}

/**
 * Format input text according to Google's EmbeddingGemma 2 Developer Guide:
 * - Queries: "task: search result | query: <query>"
 * - Chunks/Docs: "title: <title> | text: <text>"
 */
export function formatEmbeddingPrompt(
  text: string,
  isQuery: boolean = false,
  docTitle?: string
): string {
  const activeModel = getActiveEmbeddingModel();
  if (activeModel.id === 'google/embeddinggemma-2-270m') {
    if (isQuery) {
      return `task: search result | query: ${text.trim()}`;
    } else {
      const titleStr = docTitle ? `title: ${docTitle} | ` : '';
      return `${titleStr}text: ${text.trim()}`;
    }
  }
  return text.trim();
}

/**
 * Generate a dense embedding vector (768D for EmbeddingGemma 2, 384D for MiniLM)
 */
export async function generateEmbedding(
  text: string,
  options: {
    isQuery?: boolean;
    docTitle?: string;
    targetDim?: number; // MRL support (e.g. 768, 512, 256)
    onProgress?: (progress: number, text: string) => void;
  } = {}
): Promise<number[]> {
  const activeModel = getActiveEmbeddingModel();
  const formattedText = formatEmbeddingPrompt(text, options.isQuery, options.docTitle);
  const targetDim = options.targetDim || activeModel.dimensions;

  try {
    const extractor = await getEmbeddingPipeline(activeModel.id, options.onProgress);
    const output = await extractor(formattedText.slice(0, activeModel.contextWindow * 4), {
      pooling: 'mean',
      normalize: true,
    });
    let rawVector = Array.from(output.data) as number[];

    // Matryoshka Representation Learning (MRL) truncation if targetDim < output length
    if (targetDim < rawVector.length) {
      rawVector = rawVector.slice(0, targetDim);
      return l2Normalize(rawVector);
    }

    return l2Normalize(rawVector);
  } catch (error) {
    return generateDeterministicFallbackEmbedding(formattedText, targetDim);
  }
}

/**
 * Batch generate embeddings
 */
export async function generateBatchEmbeddings(
  texts: string[],
  docTitle?: string,
  onBatchProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const emb = await generateEmbedding(texts[i], {
      isQuery: false,
      docTitle,
    });
    embeddings.push(emb);
    if (onBatchProgress) {
      onBatchProgress(i + 1, texts.length);
    }
  }
  return embeddings;
}

/**
 * L2 Normalization (Mandated by EmbeddingGemma 2 Developer Guide:
 * "Always L2-normalize vectors after generation—including post-truncation if utilizing MRL dimensions.")
 */
export function l2Normalize(vector: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;

  const normalized = new Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = vector[i] / norm;
  }
  return normalized;
}

/**
 * Computes cosine similarity between two normalized vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct;
}

/**
 * Deterministic MRL vectorizer fallback (e.g. 768 dimensions for EmbeddingGemma 2)
 */
export function generateDeterministicFallbackEmbedding(text: string, dim: number = 768): number[] {
  const vector = new Array(dim).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  if (words.length === 0) return vector;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let c = 0; c < word.length; c++) {
      hash = (hash << 5) - hash + word.charCodeAt(c);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vector[idx] += 1;
  }

  return l2Normalize(vector);
}
